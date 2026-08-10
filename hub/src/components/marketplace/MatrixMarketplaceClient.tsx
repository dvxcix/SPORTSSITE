"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Boxes,
  Check,
  ChevronRight,
  Copy,
  Filter,
  GitBranch,
  Grid3X3,
  Layers3,
  Plus,
  Search,
  Share2,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { FollowButton } from "@/components/social/FollowButton";
import { UserBadges } from "@/components/social/UserBadges";
import type { Badge } from "@/lib/badges";
import styles from "./MatrixMarketplace.module.css";

type Snapshot = {
  version: 1;
  name: string;
  color: string;
  element_code: string;
  matrix_type: "classic" | "pipeline";
  match_mode: string;
  match_any_count: number | null;
  pipeline_scope: string | null;
  factors: Record<string, unknown>[];
  pipeline_steps: Record<string, unknown>[];
};

type Author = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  follower_count: number;
};
type Listing = {
  id: string;
  author_id: string;
  title: string;
  description: string;
  tags: string[];
  matrix_type: "classic" | "pipeline";
  color: string;
  snapshot: Snapshot;
  copy_count: number;
  published_at: string;
  author: Author | null;
  author_badges: Badge[];
  is_following: boolean;
  is_owner: boolean;
};

type Matrix = Snapshot & { id: string; enabled: boolean };

function humanize(value: unknown) {
  return String(value ?? "Configured step")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/Fhr/g, "FHR")
    .replace(/Hr/g, "HR")
    .replace(/Rbi/g, "RBI");
}

function nodeLabel(row: Record<string, unknown>) {
  const key = humanize(row.field_key);
  if (row.kind && row.kind !== "filter")
    return `${humanize(row.kind)} · ${key}`;
  const operator = row.operator ? humanize(row.operator) : "";
  const value =
    row.value !== null && row.value !== undefined ? ` ${row.value}` : "";
  return `${key}${operator ? ` · ${operator}${value}` : ""}`;
}

export function MatrixBlueprint({
  snapshot,
  compact = false,
}: {
  snapshot: Snapshot | Matrix;
  compact?: boolean;
}) {
  const rows =
    snapshot.matrix_type === "pipeline"
      ? snapshot.pipeline_steps
      : snapshot.factors;
  const visible = rows.slice(0, compact ? 5 : 8);
  return (
    <div
      className={styles.blueprint}
      style={{ "--matrix-color": snapshot.color } as React.CSSProperties}
    >
      <div className={styles.blueprintGrid} />
      <header>
        <span className={styles.typeIcon}>
          {snapshot.matrix_type === "pipeline" ? (
            <GitBranch size={16} />
          ) : (
            <Grid3X3 size={16} />
          )}
        </span>
        <div>
          <strong>
            {snapshot.matrix_type === "pipeline"
              ? "Pipeline Matrix"
              : "Classic Matrix"}
          </strong>
          <small>
            {snapshot.matrix_type === "pipeline"
              ? `${snapshot.pipeline_scope === "game" ? "Full game" : "Team"} scope`
              : snapshot.match_mode === "all"
                ? "Every Element must match"
                : `Match ${snapshot.match_any_count ?? 1}+ Elements`}
          </small>
        </div>
        <code>{snapshot.element_code}</code>
      </header>
      <div className={styles.flow}>
        {visible.map((row, index) => (
          <div className={styles.flowNode} key={index}>
            <i>{String(index + 1).padStart(2, "0")}</i>
            <span>
              <b>{nodeLabel(row)}</b>
              <small>
                {humanize(row.category || row.recency || "Matrix Element")}
              </small>
            </span>
            {index < visible.length - 1 && <em />}
          </div>
        ))}
        {rows.length > visible.length && (
          <div className={styles.moreNodes}>
            +{rows.length - visible.length} more
          </div>
        )}
      </div>
    </div>
  );
}

export function MatrixMarketplaceClient({
  initialShareMatrixId,
  initialAuthorId,
}: {
  initialShareMatrixId: string | null;
  initialAuthorId: string | null;
}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"newest" | "popular">("newest");
  const [type, setType] = useState<"all" | "classic" | "pipeline">("all");
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [authorId, setAuthorId] = useState<string | null>(initialAuthorId);
  const [authorLabel, setAuthorLabel] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(Boolean(initialShareMatrixId));
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sort });
    if (type !== "all") params.set("type", type);
    if (query.trim()) params.set("q", query.trim());
    if (mine) params.set("mine", "1");
    else if (authorId) params.set("author", authorId);
    const response = await fetch(`/api/matrix-marketplace?${params}`, {
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      setListings(body.listings ?? []);
      setCurrentUserId(body.current_user_id ?? "");
    }
    setLoading(false);
  }, [authorId, mine, query, sort, type]);

  useEffect(() => {
    const timer = setTimeout(load, 180);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  const clearCollection = () => {
    setAuthorId(null);
    setAuthorLabel(null);
    setMine(false);
  };

  async function importListing(listing: Listing) {
    const response = await fetch(
      `/api/matrix-marketplace/${listing.id}/import`,
      { method: "POST" },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      return setToast(body.error || "Could not add this Matrix.");
    window.dispatchEvent(new Event("ss:matrices-updated"));
    setToast(`${listing.snapshot.name} was added to your Matrices.`);
    load();
  }

  async function removeListing(listing: Listing) {
    if (
      !confirm(
        `Remove “${listing.title}” from the Marketplace? Your original Matrix stays saved.`,
      )
    )
      return;
    const response = await fetch(`/api/matrix-marketplace/${listing.id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      setToast("Listing removed.");
      load();
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroIcon}>
          <Layers3 size={24} />
        </div>
        <div className={styles.heroCopy}>
          <span>ULTIMATE WORKSPACE</span>
          <h1>Matrix Marketplace</h1>
          <p>
            Discover community-built Matrices, inspect every public Element, and
            add an independent copy to your workspace.
          </p>
        </div>
        <button
          type="button"
          className={styles.publishButton}
          onClick={() => setPublishOpen(true)}
        >
          <Plus size={17} /> Post My Matrix
        </button>
      </section>

      <section className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Matrices, uses, or tags"
          />
        </label>
        <div className={styles.segment} aria-label="Matrix type">
          {(["all", "classic", "pipeline"] as const).map((value) => (
            <button
              key={value}
              data-active={type === value}
              onClick={() => setType(value)}
            >
              {value === "all" ? (
                <Boxes size={14} />
              ) : value === "pipeline" ? (
                <GitBranch size={14} />
              ) : (
                <Grid3X3 size={14} />
              )}
              {humanize(value)}
            </button>
          ))}
        </div>
        <div className={styles.segment} aria-label="Sort order">
          <button
            data-active={sort === "newest"}
            onClick={() => setSort("newest")}
          >
            <Sparkles size={14} /> New
          </button>
          <button
            data-active={sort === "popular"}
            onClick={() => setSort("popular")}
          >
            <TrendingUp size={14} /> Most added
          </button>
        </div>
        <button
          className={styles.mineButton}
          data-active={mine}
          onClick={() => {
            setMine((value) => !value);
            setAuthorId(null);
            setAuthorLabel(null);
          }}
        >
          <Filter size={14} /> My posts
        </button>
      </section>

      {(authorId || mine) && (
        <div className={styles.collectionBar}>
          <span>
            {mine
              ? "Your shared Matrices"
              : `Matrices from ${authorLabel || "this member"}`}
          </span>
          <button onClick={clearCollection}>
            <X size={13} /> View all
          </button>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingGrid}>
          {[1, 2, 3, 4].map((item) => (
            <div key={item} />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <section className={styles.empty}>
          <div>
            <Grid3X3 size={28} />
          </div>
          <h2>
            {mine
              ? "You have not shared a Matrix yet"
              : "No Matrices match these filters"}
          </h2>
          <p>
            {mine
              ? "Publish one of your saved Matrices and give Ultimate members a clear preview before they add it."
              : "Try another search or reset the active filters."}
          </p>
          {mine ? (
            <button onClick={() => setPublishOpen(true)}>
              <Share2 size={15} /> Share a Matrix
            </button>
          ) : (
            <button onClick={clearCollection}>Reset filters</button>
          )}
        </section>
      ) : (
        <section className={styles.grid}>
          {listings.map((listing) => (
            <article className={styles.card} key={listing.id}>
              <div className={styles.authorRow}>
                <Link
                  href={`/profile/${listing.author?.username}`}
                  className={styles.avatar}
                >
                  {listing.author?.avatar_url ? (
                    <img src={listing.author.avatar_url} alt="" />
                  ) : (
                    <span>
                      {
                        (listing.author?.display_name ||
                          listing.author?.username ||
                          "?")[0]
                      }
                    </span>
                  )}
                </Link>
                <div className={styles.authorCopy}>
                  <span>
                    <Link href={`/profile/${listing.author?.username}`}>
                      {listing.author?.display_name || listing.author?.username}
                    </Link>
                    <UserBadges
                      userId={listing.author_id}
                      badges={listing.author_badges}
                      size={14}
                      maxVisible={3}
                    />
                  </span>
                  <small>
                    @{listing.author?.username} ·{" "}
                    {listing.author?.follower_count ?? 0} followers
                  </small>
                </div>
                {!listing.is_owner && currentUserId && (
                  <FollowButton
                    currentUserId={currentUserId}
                    targetUserId={listing.author_id}
                    initialFollowing={listing.is_following}
                    compact
                  />
                )}
              </div>
              <MatrixBlueprint snapshot={listing.snapshot} compact />
              <div className={styles.cardBody}>
                <div className={styles.cardTitle}>
                  <div>
                    <span>
                      {listing.matrix_type === "pipeline"
                        ? "PIPELINE"
                        : "CLASSIC"}
                    </span>
                    <h2>{listing.title}</h2>
                  </div>
                  <i style={{ background: listing.color }} />
                </div>
                {listing.description && <p>{listing.description}</p>}
                {listing.tags.length > 0 && (
                  <div className={styles.tags}>
                    {listing.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                )}
                <div className={styles.cardMeta}>
                  <span>
                    <ArrowDownToLine size={13} /> {listing.copy_count} adds
                  </span>
                  <button
                    onClick={() => {
                      setAuthorId(listing.author_id);
                      setAuthorLabel(`@${listing.author?.username}`);
                      setMine(false);
                    }}
                  >
                    More from @{listing.author?.username}
                    <ChevronRight size={13} />
                  </button>
                </div>
                <div className={styles.cardActions}>
                  <button
                    className={styles.addButton}
                    onClick={() => importListing(listing)}
                  >
                    <Plus size={15} /> Add to my Matrices
                  </button>
                  <button
                    className={styles.copyButton}
                    title="Copy Element Code"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        listing.snapshot.element_code,
                      );
                      setToast("Element Code copied.");
                    }}
                  >
                    <Copy size={15} />
                  </button>
                  {listing.is_owner && (
                    <button
                      className={styles.deleteButton}
                      title="Remove listing"
                      onClick={() => removeListing(listing)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {publishOpen && (
        <PublishMatrixModal
          initialMatrixId={
            initialShareMatrixId === "1" ? null : initialShareMatrixId
          }
          onClose={() => setPublishOpen(false)}
          onPublished={() => {
            setPublishOpen(false);
            setMine(true);
            setAuthorId(null);
            setToast("Your Matrix is live in the Marketplace.");
            load();
          }}
        />
      )}
      {!publishOpen && (
        <button
          type="button"
          className={styles.mobilePublishButton}
          onClick={() => setPublishOpen(true)}
          aria-label="Post one of your saved Matrices"
        >
          <Plus size={17} /> Post My Matrix
        </button>
      )}
      {toast && (
        <div className={styles.toast}>
          <Check size={15} />
          {toast}
        </div>
      )}
    </main>
  );
}

function PublishMatrixModal({
  initialMatrixId,
  onClose,
  onPublished,
}: {
  initialMatrixId: string | null;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [matrices, setMatrices] = useState<Matrix[]>([]);
  const [matrixId, setMatrixId] = useState(initialMatrixId || "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagText, setTagText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/matrices", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        const next = (body.matrices ?? []) as Matrix[];
        setMatrices(next);
        const selectedId =
          initialMatrixId &&
          next.some((matrix) => matrix.id === initialMatrixId)
            ? initialMatrixId
            : next[0]?.id || "";
        setMatrixId(selectedId);
        const selected = next.find((matrix) => matrix.id === selectedId);
        if (selected) setTitle(selected.name);
        setLoading(false);
      });
  }, [initialMatrixId]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.classList.add("ss-modal-open");
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("ss-modal-open");
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const selected = useMemo(
    () => matrices.find((matrix) => matrix.id === matrixId) ?? null,
    [matrices, matrixId],
  );

  async function publish() {
    if (!selected || title.trim().length < 2)
      return setError("Choose a Matrix and add a title.");
    setSaving(true);
    setError("");
    const tags = tagText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const response = await fetch("/api/matrix-marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matrix_id: selected.id,
        title,
        description,
        tags,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok)
      return setError(body.error || "Could not publish this Matrix.");
    onPublished();
  }

  return (
    <div
      className={styles.modalBackdrop}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-matrix-title"
      >
        <header>
          <div>
            <span>SHARE TO MARKETPLACE</span>
            <h2 id="publish-matrix-title">Post a saved Matrix</h2>
            <p>
              Members receive an independent copy. Your original stays private
              and editable.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Matrix publisher"
          >
            <X size={18} />
          </button>
        </header>
        {loading ? (
          <div className={styles.modalLoading}>Loading your Matrices…</div>
        ) : matrices.length === 0 ? (
          <div className={styles.modalEmpty}>
            <Grid3X3 size={24} />
            <h3>Create a Matrix first</h3>
            <p>
              Build and save a Matrix from The Dugout, then return here to share
              it.
            </p>
            <Link href="/dugout">
              Open The Dugout <ChevronRight size={14} />
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.modalContent}>
              <label>
                <span>Choose Matrix</span>
                <select
                  value={matrixId}
                  onChange={(event) => {
                    setMatrixId(event.target.value);
                    const matrix = matrices.find(
                      (item) => item.id === event.target.value,
                    );
                    if (matrix) setTitle(matrix.name);
                  }}
                >
                  {matrices.map((matrix) => (
                    <option key={matrix.id} value={matrix.id}>
                      {matrix.name} ·{" "}
                      {matrix.matrix_type === "pipeline"
                        ? "Pipeline"
                        : "Classic"}
                    </option>
                  ))}
                </select>
              </label>
              {selected && <MatrixBlueprint snapshot={selected} />}
              <div className={styles.formGrid}>
                <label>
                  <span>Marketplace title</span>
                  <input
                    maxLength={80}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="What should members call it?"
                  />
                </label>
                <label>
                  <span>
                    Tags <small>comma separated</small>
                  </span>
                  <input
                    value={tagText}
                    onChange={(event) => setTagText(event.target.value)}
                    placeholder="home-runs, market-movement"
                  />
                </label>
              </div>
              <label>
                <span>What it is built to do</span>
                <textarea
                  maxLength={600}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Give members a concise, public-facing explanation. Your exact configuration is already shown in the preview."
                />
              </label>
              {error && <div className={styles.formError}>{error}</div>}
            </div>
            <footer>
              <button onClick={onClose}>Cancel</button>
              <button
                className={styles.publishConfirm}
                disabled={saving}
                onClick={publish}
              >
                <Share2 size={15} />
                {saving ? "Publishing…" : "Publish Matrix"}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
