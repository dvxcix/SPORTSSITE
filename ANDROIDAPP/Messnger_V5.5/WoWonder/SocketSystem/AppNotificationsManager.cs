using Android.App;
using Android.Content;
using Android.Graphics;
using Android.Graphics.Drawables;
using Android.OS;
using AndroidX.Core.App;
using AndroidX.Core.Content;
using Com.Onesignal.Notifications.Internal.Badges.Impl.Shortcutbadger;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using WoWonder.Activities.ChatWindow;
using WoWonder.Activities.GroupChat;
using WoWonder.Activities.PageChat;
using WoWonder.Activities.SettingsPreferences;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Model;
using WoWonder.Helpers.Utils;
using WoWonderClient;
using WoWonderClient.Requests;

namespace WoWonder.SocketSystem;

public class AppNotificationsManager
{
    private static volatile AppNotificationsManager InstanceRenamed;
    public NotificationManager MNotificationManager;
    private readonly int Index = 21828;

    public static AppNotificationsManager Instance
    {
        get
        {
            AppNotificationsManager localInstance = InstanceRenamed;
            if (localInstance == null)
            {
                lock (typeof(AppNotificationsManager))
                {
                    localInstance = InstanceRenamed;
                    if (localInstance == null)
                    {
                        InstanceRenamed = localInstance = new AppNotificationsManager();
                    }
                }
            }
            return localInstance;
        }
    }

    public async void ShowUserNotification(string type, string conversationId, string username, string message, string id, string ChatId, string avatar, string color, int counterUnreadMessages = 1)
    {
        try
        {
            var check = ListUtils.NotifyShowList.Contains(conversationId);
            if (check)
            {
                return;
            }
            else
            {
                ListUtils.NotifyShowList.Add(conversationId);
            }

            Context mContext = Application.Context;

            //Toast.MakeText(mContext, "ShowUserNotification", ToastLength.Short)?.Show();
            string channelId = username; // The id of the channel.

            var intent = new Intent(mContext, typeof(ReplyReceiver));

            intent.SetAction("ACTION_REPLY");
            intent.PutExtra("NOTIFICATION_ID", channelId);
            intent.PutExtra("TypeChat", type);
            intent.PutExtra("ChatId", ChatId);
            intent.PutExtra("ToId", id);
            intent.PutExtra("Name", username);
            intent.PutExtra("Avatar", avatar);
            intent.PutExtra("Color", color);

            PendingIntent replyPendingIntent;
            // Create an intent for the reply action 
            if (Build.VERSION.SdkInt >= BuildVersionCodes.N)
                replyPendingIntent = PendingIntent.GetBroadcast(mContext, 100, intent, Build.VERSION.SdkInt >= BuildVersionCodes.M ? PendingIntentFlags.UpdateCurrent | PendingIntentFlags.Immutable : PendingIntentFlags.UpdateCurrent);
            else
                replyPendingIntent = PendingIntent.GetActivity(mContext, 100, intent, Build.VERSION.SdkInt >= BuildVersionCodes.M ? PendingIntentFlags.UpdateCurrent | PendingIntentFlags.Immutable : PendingIntentFlags.UpdateCurrent);

            // Create the remote input
            var remoteInput = new AndroidX.Core.App.RemoteInput.Builder("text_reply").SetAllowFreeFormInput(true).SetLabel(mContext.GetString(Resource.String.Lbl_Reply)).Build();

            // Create the reply action and attach the remote input
            NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(Resource.Drawable.icon_chat_reply, mContext.GetString(Resource.String.Lbl_Reply), replyPendingIntent).SetAllowGeneratedReplies(true).AddRemoteInput(remoteInput).Build();

            PendingIntent pendingIntent = GetNotificationIntent(type, id, ChatId, color);

            NotificationCompat.Builder mNotifyBuilder;

            MNotificationManager = (NotificationManager)mContext.GetSystemService(Context.NotificationService);
            if (Build.VERSION.SdkInt >= BuildVersionCodes.O)
            {
                var name = AppSettings.ApplicationName; // The user-visible name of the channel.
                var mChannel = new NotificationChannel(channelId, name, NotificationImportance.High);
                mNotifyBuilder = new NotificationCompat.Builder(mContext, channelId).SetVisibility(NotificationCompat.VisibilityPublic).SetShowWhen(true).SetColor(ContextCompat.GetColor(mContext, Resource.Color.accent)).SetSmallIcon(Resource.Mipmap.icon).SetContentIntent(pendingIntent).SetChannelId(channelId).SetCategory(NotificationCompat.CategoryMessage);

                if (Build.VERSION.SdkInt >= BuildVersionCodes.P)
                    mNotifyBuilder.SetAllowSystemGeneratedContextualActions(true);

                MNotificationManager.CreateNotificationChannel(mChannel);
            }
            else
            {
                mNotifyBuilder = new NotificationCompat.Builder(mContext, channelId).SetVisibility(NotificationCompat.VisibilityPublic).SetShowWhen(true).SetColor(ContextCompat.GetColor(mContext, Resource.Color.accent)).SetSmallIcon(Resource.Mipmap.icon).SetContentIntent(pendingIntent).SetPriority((int)NotificationPriority.High).SetCategory(NotificationCompat.CategoryMessage);
                mNotifyBuilder.SetAllowSystemGeneratedContextualActions(false);
            }

            NotificationCompat.InboxStyle inboxStyle = new NotificationCompat.InboxStyle();
            //if more message
            if (ListUtils.MessageUnreadList?.Count > 0)
            {
                if (ListUtils.MessageUnreadList.Count == 1)
                {
                    mNotifyBuilder.AddAction(replyAction);

                    inboxStyle.SetBigContentTitle(username);

                    mNotifyBuilder.SetContentTitle(username);
                    if (message != null)
                    {
                        mNotifyBuilder.SetContentText(message);
                    }

                    inboxStyle.SetSummaryText(counterUnreadMessages + " " + mContext.GetString(Resource.String.new_messages_notify));

                    var list = ListUtils.MessageUnreadList.Where(a => a.Sender == id)?.ToList();
                    if (list?.Count > 0)
                        foreach (var m in list)
                        {
                            inboxStyle.AddLine(m.Message);
                        }
                }
                else
                {
                    inboxStyle.SetBigContentTitle(AppSettings.ApplicationName);

                    mNotifyBuilder.SetContentTitle(username);
                    if (message != null)
                    {
                        mNotifyBuilder.SetContentText(message);
                    }
                    inboxStyle.SetSummaryText(counterUnreadMessages + " " + mContext.GetString(Resource.String.messages_from_notify) + " " + counterUnreadMessages + " " + mContext.GetString(Resource.String.chats_notify));

                    var list = ListUtils.MessageUnreadList.Where(a => a.Sender == id)?.ToList();
                    if (list?.Count > 0)
                        foreach (var m in list)
                        {
                            inboxStyle.AddLine(m.Message);
                        }
                }
            }
            else
            {
                mNotifyBuilder.AddAction(replyAction);

                inboxStyle.SetBigContentTitle(username);

                mNotifyBuilder.SetContentTitle(username);

                mNotifyBuilder.SetContentText(message);
                inboxStyle.SetSummaryText(counterUnreadMessages + " " + mContext.GetString(Resource.String.new_messages_notify));
                inboxStyle.AddLine(message);
            }

            mNotifyBuilder.SetStyle(inboxStyle);
            Drawable drawable = ContextCompat.GetDrawable(mContext, Resource.Drawable.no_profile_image);

            if (!string.IsNullOrEmpty(avatar))
            {
                var url = avatar;
                if (!string.IsNullOrEmpty(url))
                {
                    var bit = await BitmapUtils.GetImageBitmapFromUrl(url);
                    if (bit != null)
                        mNotifyBuilder.SetLargeIcon(bit);
                }
            }
            else
            {
                Bitmap bitmap = ConvertToBitmap(drawable, 150, 150);
                mNotifyBuilder.SetLargeIcon(bitmap);
            }

            if (MainSettings.SharedData?.GetBoolean("checkBox_PlaySound_key", true) ?? true)
            {
                mNotifyBuilder.SetDefaults(NotificationCompat.DefaultSound);
            }

            //if (MainSettings.SharedData.GetBoolean("checkBox_vibrate_notifications_key", true))
            //{
            //	long[] vibrate = new long[] { 2000, 2000, 2000, 2000, 2000 };
            //  mNotifyBuilder.SetVibrate(vibrate);
            //}

            int defaultVibrate = 0;
            defaultVibrate |= NotificationCompat.DefaultVibrate;
            mNotifyBuilder.SetDefaults(defaultVibrate);

            if (color != null)
            {
                mNotifyBuilder.SetLights(Color.ParseColor(color), 1500, 1500);
            }
            else
            {
                int defaults = 0;
                defaults |= NotificationCompat.DefaultLights;
                mNotifyBuilder.SetDefaults(defaults);
            }

            mNotifyBuilder.SetAutoCancel(true);

            MNotificationManager?.Notify(id, Index, mNotifyBuilder.Build());

            SetupBadger(counterUnreadMessages);
        }
        catch (Exception exception)
        {
            Methods.DisplayReportResultTrack(exception);
        }
    }

    public string GetReplyMessage(Intent intent)
    {
        Bundle remoteInput = Android.App.RemoteInput.GetResultsFromIntent(intent);
        if (remoteInput == null || !(remoteInput.ContainsKey("text_reply")))
            return null;

        return remoteInput.GetCharSequence("text_reply");
    }

    private PendingIntent GetNotificationIntent(string type, string id, string ChatId, string color)
    {
        try
        {
            Context mContext = Application.Context;
            Intent intent = null!;
            switch (type)
            {
                case "user":
                    {
                        intent = new Intent(mContext, typeof(ChatWindowActivity));
                        intent.PutExtra("UserID", id);
                        intent.PutExtra("ShowEmpty", "no");
                        intent.PutExtra("TypeChat", "OneSignalNotification");
                        intent.PutExtra("ColorChat", color);
                        intent.PutExtra("ChatId", ChatId);
                        break;
                    }
                case "page":
                    {
                        intent = new Intent(mContext, typeof(PageChatWindowActivity));
                        intent.PutExtra("ShowEmpty", "no");
                        intent.PutExtra("PageId", id);
                        intent.PutExtra("ChatId", ChatId);
                        break;
                    }
                case "group":
                    {
                        intent = new Intent(mContext, typeof(GroupChatWindowActivity));
                        intent.PutExtra("ShowEmpty", "no");
                        intent.PutExtra("GroupId", id);
                        intent.PutExtra("ChatId", ChatId);
                        break;
                    }

            }
            intent.SetFlags(ActivityFlags.ClearTop | ActivityFlags.NewTask | ActivityFlags.MultipleTask);

            PendingIntent pendingIntent = PendingIntent.GetActivity(mContext, 0, intent, Build.VERSION.SdkInt >= BuildVersionCodes.M ? PendingIntentFlags.UpdateCurrent | PendingIntentFlags.Immutable : PendingIntentFlags.UpdateCurrent);
            return pendingIntent;
        }
        catch (Exception e)
        {
            Methods.DisplayReportResultTrack(e);
            return null;
        }
    }

    private Bitmap ConvertToBitmap(Drawable drawable, int widthPixels, int heightPixels)
    {
        Bitmap mutableBitmap = Bitmap.CreateBitmap(widthPixels, heightPixels, Bitmap.Config.Argb8888);
        Canvas canvas = new Canvas(mutableBitmap);
        drawable.SetBounds(0, 0, widthPixels, heightPixels);
        drawable.Draw(canvas);

        return mutableBitmap;
    }

    NotificationCompat.Builder MNotifyBuilder;
    public void ShowUpDownNotification(string userName, string messageId, string userId, string chatId)
    {
        try
        {
            Context mContext = Application.Context;
            string channelId;

            MNotificationManager = (NotificationManager)mContext.GetSystemService(Context.NotificationService);
            if (Build.VERSION.SdkInt >= BuildVersionCodes.O)
            {
                channelId = userId; // The id of the channel.
                var name = AppSettings.ApplicationName; // The user-visible name of the channel.
                var mChannel = new NotificationChannel(channelId, name, NotificationImportance.Low);
                MNotifyBuilder = new NotificationCompat.Builder(mContext, channelId).SetVisibility(NotificationCompat.VisibilityPublic).SetColor(ContextCompat.GetColor(mContext, Resource.Color.accent)).SetSmallIcon(Resource.Mipmap.icon).SetChannelId(channelId).SetCategory(NotificationCompat.CategoryProgress);

                MNotificationManager?.CreateNotificationChannel(mChannel);
            }
            else
            {
                channelId = userId; // The id of the channel.
                MNotifyBuilder = new NotificationCompat.Builder(mContext, channelId).SetVisibility(NotificationCompat.VisibilityPublic).SetColor(ContextCompat.GetColor(mContext, Resource.Color.accent)).SetSmallIcon(Resource.Mipmap.icon).SetPriority((int)NotificationPriority.Low).SetCategory(NotificationCompat.CategoryProgress);
            }

            MNotifyBuilder.SetAutoCancel(true)
                .SetOngoing(false)
                .SetDefaults(NotificationCompat.DefaultLights)
                .SetSound(null, 0);

            if (!string.IsNullOrEmpty(userName))
            {
                MNotifyBuilder.SetContentTitle(mContext.GetText(Resource.String.Lbl_SendingFileTo) + " " + userName);
            }
            else
            {
                MNotifyBuilder.SetContentTitle(mContext.GetText(Resource.String.Lbl_SendingFile));
            }

            MNotifyBuilder.SetProgress(0, 0, true);
            MNotificationManager?.Notify(messageId, Index, MNotifyBuilder.Build());
        }
        catch (Exception exception)
        {
            Methods.DisplayReportResultTrack(exception);
        }
    }

    /// <summary>
    /// method to cancel  All notification
    /// </summary>
    public void CancelAllNotification()
    {
        try
        {
            MNotificationManager?.CancelAll();
        }
        catch (Exception exception)
        {
            Methods.DisplayReportResultTrack(exception);
        }
    }

    /// <summary>
    /// method to cancel a specific notification
    /// </summary>
    /// <param name="tag"> </param>
    public void CancelNotification(string tag)
    {
        try
        {
            MNotificationManager?.Cancel(tag, Index);
        }
        catch (Exception exception)
        {
            Methods.DisplayReportResultTrack(exception);
        }
    }

    public void UpdateUpDownNotification(string messageId, int progress)
    {
        try
        {
            if (MNotifyBuilder != null)
            {
                MNotifyBuilder.SetContentText(progress + "%");

                MNotifyBuilder.SetProgress(100, progress, false);
                MNotificationManager?.Notify(messageId, Index, MNotifyBuilder.Build());
            }
        }
        catch (Exception e)
        {
            Methods.DisplayReportResultTrack(e);
        }
    }

    /// <summary>
    /// method to set badger counter for the app
    /// </summary>
    public void SetupBadger(int messageBadgeCounter = 0)
    {
        try
        {
            Context mContext = Application.Context;
            string deviceName = Build.Manufacturer;
            string[] devicesName = new string[] { "Sony", "Samsung", "LG", "HTC", "Xiaomi", "ASUS", "ADW", "NOVA", "Huawei", "ZUK", "APEX", "OPPO", "ZTE", "EverythingMe" };

            if (devicesName.Any(device => deviceName != null && deviceName.Equals(device.ToLower())))
            {
                try
                {
                    try
                    {
                        ShortcutBadger.ApplyCount(mContext, messageBadgeCounter);
                    }
                    catch (Exception e)
                    {
                        Console.WriteLine(" ShortcutBadger Exception " + e.Message);
                    }
                }
                catch (Exception e)
                {
                    Console.WriteLine(" ShortcutBadger Exception " + e.Message);
                }
            }
        }
        catch (Exception e)
        {
            Methods.DisplayReportResultTrack(e);
        }
    }
}

[BroadcastReceiver(Enabled = true, Exported = false)]
[IntentFilter(new[] { Intent.ActionSend })]
public class ReplyReceiver : BroadcastReceiver
{
    public override void OnReceive(Context context, Intent intent)
    {
        try
        {
            if (intent?.Action == "ACTION_REPLY")
            {
                var replyText = AppNotificationsManager.Instance.GetReplyMessage(intent);
                if (!string.IsNullOrEmpty(replyText))
                {
                    // Handle the received text, for example, display it in a toast
                    var typeChat = intent.GetStringExtra("TypeChat");
                    var chatId = intent.GetStringExtra("ChatId");
                    var id = intent.GetStringExtra("ToId");
                    var name = intent.GetStringExtra("Name");
                    var avatar = intent.GetStringExtra("Avatar");
                    var color = intent.GetStringExtra("Color");

                    var unixTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                    var time = unixTimestamp.ToString();

                    if (typeChat == "user")
                    {
                        if (Methods.CheckConnectivity())
                        {
                            if (AppSettings.ConnectionTypeChat == InitializeWoWonder.ConnectionType.Socket)
                            {
                                UserDetails.Socket?.EmitAsync_SendMessage(id, UserDetails.AccessToken, UserDetails.Username, replyText, color, "0", time);
                            }
                            else
                            {
                                PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => RequestsAsync.Message.SendMessageAsync(id, time, "", replyText) });
                            }
                        }
                    }
                    else if (typeChat == "group")
                    {
                        if (Methods.CheckConnectivity())
                        {
                            if (AppSettings.ConnectionTypeChat == InitializeWoWonder.ConnectionType.Socket)
                            {
                                UserDetails.Socket?.EmitAsync_SendGroupMessage(id, UserDetails.AccessToken, UserDetails.Username, replyText, "0", time);
                            }
                            else
                            {
                                PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => RequestsAsync.GroupChat.Send_MessageToGroupChatAsync(id, time, replyText) });
                            }
                        }
                    }
                    else if (typeChat == "page")
                    {
                        if (Methods.CheckConnectivity())
                        {
                            if (AppSettings.ConnectionTypeChat == InitializeWoWonder.ConnectionType.Socket)
                            {
                                UserDetails.Socket?.EmitAsync_SendPageMessage(id, UserDetails.UserId, UserDetails.AccessToken, UserDetails.Username, replyText, "0", time);
                            }
                            else
                            {
                                PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => RequestsAsync.PageChat.SendMessageToPageChatAsync(id, UserDetails.UserId, time, replyText) });
                            }
                        }
                    }
                }
            }
        }
        catch (Exception e)
        {
            Methods.DisplayReportResultTrack(e);
        }
    }
}