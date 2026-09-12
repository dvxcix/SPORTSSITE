"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Reply,
  Send,
  Settings2,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  MemberAvatar,
  type MemberRingStyle,
} from "@/components/social/MemberAvatar";
import { LinkifiedText } from "@/components/social/LinkifiedText";
import { EmojiPicker } from "@/components/social/EmojiPicker";
import { GifPicker } from "@/components/social/GifPicker";
import { SafeImage } from "@/components/ui/SafeImage";
import { uploadMedia } from "@/lib/uploadMedia";
import { notify } from "@/lib/notify";

type GroupUser = {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_ring_style?: MemberRingStyle | null;
  avatar_ring_color?: string | null;
  is_verified?: boolean | null;
};
export type GroupConversationMember = {
  user_id: string;
  role: "owner" | "member";
  muted: boolean;
  last_read_at?: string | null;
  joined_at: string;
  user: GroupUser | null;
};
export type GroupMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  media_urls?: string[] | null;
  reply_to_id?: string | null;
  edited_at?: string | null;
  is_deleted?: boolean;
  created_at: string;
  sender?: GroupUser | null;
  reply_to?: Pick<GroupMessage, "id" | "content" | "sender_id"> | null;
};
export type GroupMessageReaction = {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};
type FoundUser = GroupUser;

export function GroupDMRoom({
  conversation,
  members,
  initialMessages,
  initialReactions,
  currentUserId,
}: {
  conversation: {
    id: string;
    name: string;
    owner_id: string;
    avatar_url?: string | null;
  };
  members: GroupConversationMember[];
  initialMessages: GroupMessage[];
  initialReactions: GroupMessageReaction[];
  currentUserId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState(initialMessages);
  const [memberList, setMemberList] = useState(members);
  const [reactions, setReactions] = useState(initialReactions);
  const [showMembers, setShowMembers] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<FoundUser[]>([]);
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [replyingTo, setReplyingTo] = useState<GroupMessage | null>(null);
  const [editing, setEditing] = useState<GroupMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const memberById = useMemo(
    () => new Map(memberList.map((member) => [member.user_id, member.user])),
    [memberList],
  );
  const currentMember = memberList.find(
    (member) => member.user_id === currentUserId,
  );
  const isOwner = conversation.owner_id === currentUserId;

  useEffect(() => {
    const channel = supabase
      .channel(`group-dm:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        async (payload) => {
          const next = payload.new as GroupMessage;
          const { data: sender } = await supabase
            .from("users")
            .select(
              "id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified",
            )
            .eq("id", next.sender_id)
            .maybeSingle();
          setMessages((current) =>
            current.some((message) => message.id === next.id)
              ? current
              : [...current, { ...next, sender } as GroupMessage],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "group_messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const updated = payload.new as GroupMessage;
          setMessages((current) =>
            current.map((message) =>
              message.id === updated.id ? { ...message, ...updated } : message,
            ),
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversation.id, supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("group-dm-reactions:" + conversation.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_message_reactions" },
        (payload) => {
          const reaction = payload.new as GroupMessageReaction;
          if (messages.some((message) => message.id === reaction.message_id)) {
            setReactions((current) =>
              current.some(
                (item) =>
                  item.message_id === reaction.message_id &&
                  item.user_id === reaction.user_id &&
                  item.emoji === reaction.emoji,
              )
                ? current
                : [...current, reaction],
            );
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "group_message_reactions" },
        (payload) => {
          const reaction = payload.old as GroupMessageReaction;
          setReactions((current) =>
            current.filter(
              (item) =>
                !(
                  item.message_id === reaction.message_id &&
                  item.user_id === reaction.user_id &&
                  item.emoji === reaction.emoji
                ),
            ),
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversation.id, messages, supabase]);

  useEffect(() => {
    const query = memberQuery.trim();
    if (!isOwner || query.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const safe = query.replace(/[%_,()]/g, "");
      const matcher =
        "username.ilike.%" + safe + "%,display_name.ilike.%" + safe + "%";
      const { data } = await supabase
        .from("users")
        .select(
          "id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,is_verified",
        )
        .eq("allow_dms", true)
        .or(matcher)
        .limit(8);
      if (!cancelled)
        setMemberResults(
          ((data ?? []) as FoundUser[]).filter(
            (user) => !memberList.some((member) => member.user_id === user.id),
          ),
        );
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOwner, memberList, memberQuery, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
    void supabase
      .from("group_conversation_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversation.id)
      .eq("user_id", currentUserId);
  }, [conversation.id, currentUserId, messages.length, supabase]);

  function insertAtCursor(value: string) {
    const element = inputRef.current;
    const start = element?.selectionStart ?? text.length;
    const end = element?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + value + text.slice(end));
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + value.length, start + value.length);
    });
  }
  async function send() {
    const content = text.trim();
    if ((!content && !mediaUrl) || sending || uploading) return;
    setSending(true);
    setError("");
    if (editing) {
      const before = messages;
      setMessages((current) =>
        current.map((message) =>
          message.id === editing.id
            ? { ...message, content, edited_at: new Date().toISOString() }
            : message,
        ),
      );
      const { error: editError } = await supabase
        .from("group_messages")
        .update({ content, edited_at: new Date().toISOString() })
        .eq("id", editing.id)
        .eq("sender_id", currentUserId);
      setSending(false);
      if (editError) {
        setMessages(before);
        setError("Edit not saved. Try again.");
        return;
      }
      setText("");
      setEditing(null);
      return;
    }
    const { data, error: sendError } = await supabase
      .from("group_messages")
      .insert({
        conversation_id: conversation.id,
        sender_id: currentUserId,
        content,
        media_urls: mediaUrl ? [mediaUrl] : [],
        reply_to_id: replyingTo?.id ?? null,
      })
      .select(
        "id,conversation_id,sender_id,content,media_urls,reply_to_id,edited_at,is_deleted,created_at",
      )
      .single();
    setSending(false);
    if (sendError || !data) {
      setError("Message not sent. Try again.");
      return;
    }
    setMessages((current) =>
      current.some((message) => message.id === data.id)
        ? current
        : [...current, data as GroupMessage],
    );
    setText("");
    setMediaUrl("");
    setReplyingTo(null);
    for (const member of memberList)
      if (member.user_id !== currentUserId && !member.muted)
        void notify(supabase, {
          userId: member.user_id,
          actorId: currentUserId,
          type: "message",
          message: `sent a message in ${conversation.name}`,
          link: `/messages/group/${conversation.id}`,
          targetId: conversation.id,
          targetType: "group_conversation",
        });
  }
  async function deleteMessage(message: GroupMessage) {
    const before = messages;
    setMessages((current) =>
      current.map((item) =>
        item.id === message.id
          ? { ...item, content: "", media_urls: [], is_deleted: true }
          : item,
      ),
    );
    const { error: deleteError } = await supabase
      .from("group_messages")
      .update({
        content: "",
        media_urls: [],
        is_deleted: true,
        edited_at: new Date().toISOString(),
      })
      .eq("id", message.id)
      .eq("sender_id", currentUserId);
    if (deleteError) {
      setMessages(before);
      setError("Message not deleted. Try again.");
    }
  }
  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const result = await uploadMedia(file, "messages");
      if ("error" in result) setError(result.error);
      else setMediaUrl(result.publicUrl);
    } catch {
      setError("Image upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }
  async function toggleReaction(messageId: string, emoji: string) {
    const existing = reactions.find(
      (reaction) =>
        reaction.message_id === messageId &&
        reaction.user_id === currentUserId &&
        reaction.emoji === emoji,
    );
    if (existing) {
      setReactions((current) =>
        current.filter((reaction) => reaction !== existing),
      );
      const { error: reactionError } = await supabase
        .from("group_message_reactions")
        .delete()
        .match({ message_id: messageId, user_id: currentUserId, emoji });
      if (reactionError) {
        setReactions((current) => [...current, existing]);
        setError("Reaction not updated. Try again.");
      }
      return;
    }
    const optimistic = {
      message_id: messageId,
      user_id: currentUserId,
      emoji,
      created_at: new Date().toISOString(),
    };
    setReactions((current) => [...current, optimistic]);
    const { error: reactionError } = await supabase
      .from("group_message_reactions")
      .insert(optimistic);
    if (reactionError) {
      setReactions((current) =>
        current.filter((reaction) => reaction !== optimistic),
      );
      setError("Reaction not updated. Try again.");
    }
  }
  async function manageMember(user: FoundUser, action: "add" | "remove") {
    setError("");
    const { error: memberError } = await supabase.rpc(
      "manage_group_conversation_member",
      {
        target_conversation_id: conversation.id,
        target_user_id: user.id,
        member_action: action,
      },
    );
    if (memberError) {
      setError("Members could not be updated. Try again.");
      return;
    }
    if (action === "add") {
      setMemberList((current) => [
        ...current,
        {
          user_id: user.id,
          role: "member",
          muted: false,
          joined_at: new Date().toISOString(),
          user,
        },
      ]);
      setMemberQuery("");
      setMemberResults([]);
    } else
      setMemberList((current) =>
        current.filter((member) => member.user_id !== user.id),
      );
  }
  async function toggleMute() {
    if (!currentMember) return;
    const muted = !currentMember.muted;
    setMemberList((current) =>
      current.map((member) =>
        member.user_id === currentUserId ? { ...member, muted } : member,
      ),
    );
    const { error: muteError } = await supabase
      .from("group_conversation_members")
      .update({ muted })
      .eq("conversation_id", conversation.id)
      .eq("user_id", currentUserId);
    if (muteError) {
      setMemberList((current) =>
        current.map((member) =>
          member.user_id === currentUserId
            ? { ...member, muted: !muted }
            : member,
        ),
      );
      setError("Notification setting not saved.");
    }
  }
  async function leaveConversation() {
    if (isOwner) return;
    const { error: leaveError } = await supabase
      .from("group_conversation_members")
      .delete()
      .eq("conversation_id", conversation.id)
      .eq("user_id", currentUserId);
    if (leaveError) {
      setError("Could not leave this conversation.");
      return;
    }
    router.push("/messages");
    router.refresh();
  }

  return (
    <div className="ss-dm-room ss-group-dm-room">
      <header className="ss-dm-header">
        <Link
          href="/messages"
          className="ss-dm-back"
          aria-label="Back to messages"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="ss-group-avatar-stack" aria-hidden="true">
          {memberList.slice(0, 3).map((member) => (
            <MemberAvatar
              key={member.user_id}
              src={member.user?.avatar_url}
              name={
                member.user?.display_name || member.user?.username || "Member"
              }
              size={34}
              ringStyle={member.user?.avatar_ring_style}
              ringColor={member.user?.avatar_ring_color}
            />
          ))}
        </div>
        <div className="ss-group-dm-title">
          <strong>{conversation.name}</strong>
          <span>{memberList.length} members</span>
        </div>
        <span className="ss-dm-private">
          <Users size={11} />
          Group
        </span>
        <button
          type="button"
          className="ss-dm-header-action"
          onClick={() => setShowMembers((value) => !value)}
          aria-label="Conversation settings"
          aria-expanded={showMembers}
        >
          <Settings2 size={16} />
        </button>
      </header>
      {showMembers && (
        <section className="ss-group-member-panel" aria-label="Conversation members">
          <header>
            <div><strong>Members</strong><span>{memberList.length} of 20</span></div>
            <button type="button" onClick={() => void toggleMute()}>
              {currentMember?.muted ? <Volume2 size={13}/> : <VolumeX size={13}/>}
              {currentMember?.muted ? 'Unmute' : 'Mute'}
            </button>
            {!isOwner && <button type="button" className="is-danger" onClick={() => void leaveConversation()}>Leave</button>}
          </header>
          {isOwner && memberList.length < 20 && (
            <div className="ss-group-member-search">
              <UserPlus size={14}/>
              <input value={memberQuery} onChange={(event) => { const value = event.target.value; setMemberQuery(value); if (value.trim().length < 2) setMemberResults([]) }} placeholder="Add a member" aria-label="Find a member to add"/>
            </div>
          )}
          {memberResults.length > 0 && <div className="ss-group-member-results">
            {memberResults.map((user) => <button type="button" key={user.id} onClick={() => void manageMember(user, 'add')}>
              <MemberAvatar src={user.avatar_url} name={user.display_name || user.username} size={28} ringStyle={user.avatar_ring_style} ringColor={user.avatar_ring_color}/>
              <span><strong>{user.display_name || user.username}</strong><small>@{user.username}</small></span><UserPlus size={14}/>
            </button>)}
          </div>}
          <div className="ss-group-member-list">
            {memberList.map((member) => <div key={member.user_id}>
              <MemberAvatar src={member.user?.avatar_url} name={member.user?.display_name || member.user?.username || 'Member'} size={30} ringStyle={member.user?.avatar_ring_style} ringColor={member.user?.avatar_ring_color}/>
              <span><strong>{member.user?.display_name || member.user?.username || 'Member'}</strong><small>{member.role}</small></span>
              {isOwner && member.role !== 'owner' && <button type="button" onClick={() => member.user && void manageMember(member.user, 'remove')} aria-label={'Remove ' + (member.user?.display_name || member.user?.username || 'member')}><UserMinus size={14}/></button>}
            </div>)}
          </div>
        </section>
      )}
      {error && (
        <p className="ss-dm-error" role="alert">
          {error}
        </p>
      )}
      <div className="ss-dm-messages">
        <div className="ss-dm-thread-start">
          <Users size={13} />
          <span>{conversation.name} started</span>
        </div>
        {messages.map((message) => {
          const sender = message.sender ?? memberById.get(message.sender_id);
          const name = sender?.display_name || sender?.username || "Member";
          const mine = message.sender_id === currentUserId;
          const reply =
            message.reply_to ??
            messages.find((item) => item.id === message.reply_to_id);
          return (
            <div
              id={`message-${message.id}`}
              key={message.id}
              className={`ss-dm-message ${mine ? "is-mine" : ""}`}
            >
              {!mine && (
                <MemberAvatar
                  src={sender?.avatar_url}
                  name={name}
                  size={28}
                  ringStyle={sender?.avatar_ring_style}
                  ringColor={sender?.avatar_ring_color}
                />
              )}
              <div className="ss-dm-bubble-wrap">
                {!mine && (
                  <span className="ss-group-message-author">{name}</span>
                )}
                {reply && (
                  <button
                    type="button"
                    className="ss-dm-reply-context"
                    onClick={() =>
                      document
                        .getElementById(`message-${reply.id}`)
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        })
                    }
                  >
                    <Reply size={10} />
                    <p>{reply.content}</p>
                  </button>
                )}
                <div
                  className={`ss-dm-bubble ${message.is_deleted ? "is-deleted" : ""}`}
                >
                  {message.is_deleted ? (
                    "Message deleted"
                  ) : (
                    <>
                      <LinkifiedText text={message.content} />
                      {message.edited_at && (
                        <small className="ss-chat-edited">edited</small>
                      )}
                    </>
                  )}
                </div>
                {!message.is_deleted && message.media_urls?.[0] && (
                  <SafeImage
                    src={message.media_urls[0]}
                    alt=""
                    className="ss-dm-media"
                  />
                )}
                {!message.is_deleted && (
                  <div className="ss-dm-reactions" aria-label="Message reactions">
                    {['🔥', '👍', '❤️', '😂'].map((emoji) => {
                      const matching = reactions.filter((reaction) => reaction.message_id === message.id && reaction.emoji === emoji)
                      const active = matching.some((reaction) => reaction.user_id === currentUserId)
                      return <button
                        type="button"
                        key={emoji}
                        data-active={active}
                        data-has={matching.length > 0}
                        aria-pressed={active}
                        aria-label={(active ? 'Remove ' : 'Add ') + emoji + ' reaction'}
                        onClick={() => void toggleReaction(message.id, emoji)}
                      >
                        {emoji}{matching.length > 0 && <span>{matching.length}</span>}
                      </button>
                    })}
                  </div>
                )}
                <div className="ss-dm-message-meta">
                  <time>
                    {new Date(message.created_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                  {!message.is_deleted && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(null);
                          setReplyingTo(message);
                          inputRef.current?.focus();
                        }}
                      >
                        <Reply size={10} />
                        Reply
                      </button>
                      {mine && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingTo(null);
                              setEditing(message);
                              setText(message.content);
                              inputRef.current?.focus();
                            }}
                          >
                            <Pencil size={10} />
                            Edit
                          </button>
                          <button
                            type="button"
                            className="is-danger"
                            onClick={() => void deleteMessage(message)}
                          >
                            <Trash2 size={10} />
                            Delete
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="ss-dm-composer">
        {editing ? (
          <div className="ss-dm-replying is-editing">
            <Pencil size={12} />
            <div>
              <span>Editing message</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setText("");
              }}
              aria-label="Cancel edit"
            >
              <X size={14} />
            </button>
          </div>
        ) : replyingTo ? (
          <div className="ss-dm-replying">
            <Reply size={12} />
            <div>
              <span>Replying to message</span>
              <p>{replyingTo.content}</p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              aria-label="Cancel reply"
            >
              <X size={14} />
            </button>
          </div>
        ) : null}
        {mediaUrl && (
          <div className="ss-chat-media-preview">
            <SafeImage src={mediaUrl} alt="Upload preview" />
            <button
              type="button"
              onClick={() => setMediaUrl("")}
              aria-label="Remove image"
            >
              <X size={13} />
            </button>
          </div>
        )}
        <div className="ss-dm-composer-row">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={`Message ${conversation.name}…`}
            maxLength={1000}
            rows={1}
            className="ss-dm-input"
            aria-label={`Message ${conversation.name}`}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="ss-chat-attach"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Attach image"
          >
            <ImageIcon size={16} />
          </button>
          <EmojiPicker onSelect={insertAtCursor} />
          <GifPicker uploadKind="messages" onSelect={setMediaUrl} />
          <button
            type="button"
            className="ss-dm-send"
            onClick={() => void send()}
            disabled={(!text.trim() && !mediaUrl) || sending || uploading}
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
