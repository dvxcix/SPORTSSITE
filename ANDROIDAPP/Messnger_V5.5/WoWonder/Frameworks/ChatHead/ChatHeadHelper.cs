using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.Graphics;
using Android.Graphics.Drawables;
using Android.OS;
using Android.Provider;
using Android.Views;
using Android.Widget;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using WoWonder.Activities.ChatWindow;
using WoWonder.Activities.GroupChat;
using WoWonder.Helpers.Utils;
using WoWonderClient.Classes.Message;
using WoWonderClient.Classes.Posts;
using Activity = Android.App.Activity;
using Person = Android.App.Person;
using Uri = Android.Net.Uri;

namespace WoWonder.Frameworks.ChatHead
{
    public class ChatHeadObject
    {
        public string ChatId { set; get; }
        public string PageId { set; get; }
        public string GroupId { set; get; }
        public string UserId { set; get; }
        public string Avatar { set; get; }
        public string ChatType { set; get; }
        public string ChatColor { set; get; }
        public string Name { set; get; }
        public string LastSeen { set; get; }
        public string LastSeenUnixTime { set; get; }
        public string MessageCount { set; get; }
    }

    public class ChatHeadHelper
    {
        private static readonly string ChannelId = "bubble_notification_channel";
        private static readonly string ChannelName = "Incoming notification";
        private static readonly string ChannelDescription = "Incoming notification description";
        private static readonly string ShortcutLabel = "Notification";
        private static readonly int BubbleNotificationId = 1237;
        private static readonly string BubbleShortcutId = "bubble_shortcut";
        private static readonly int RequestContent = 1;
        private static readonly int RequestBubble = 2;
        private static NotificationManager NotificationManager;
        private static readonly string Tag = "NotificationHelper";
        private readonly Context MContext;
        private static ChatHeadHelper MInstance;
        public bool RunBubble;

        private ChatHeadHelper(Context context)
        {
            MContext = context;
            if (Build.VERSION.SdkInt >= BuildVersionCodes.Q)
                InitNotificationManager();
        }

        public static ChatHeadHelper GetInstance(Context context)
        {
            if (MInstance == null)
            {
                MInstance = new ChatHeadHelper(context);
            }
            return MInstance;
        }

        public void ShowNotification(ChatHeadObject floating)
        {
            try
            {
                RunBubble = true;
                Icon icon = Icon.CreateWithResource(MContext, Resource.Drawable.ic_stat_onesignal_default);

                if (IsMinAndroidR())
                    UpdateShortcuts(icon);

                Person user = new Person.Builder().SetName("You").Build();
                Person person = new Person.Builder().SetName(MContext.GetString(Resource.String.Lbl_ChatHead_Title)).SetIcon(icon).Build();

                Intent bubbleIntent = null;

                if (floating.ChatType == "user")
                {
                    bubbleIntent = new Intent(MContext, typeof(ChatWindowActivity));
                    bubbleIntent.SetAction(Intent.ActionView);

                    var mainChatColor = floating.ChatColor.Contains("rgb") ? Methods.FunString.ConvertColorRgBtoHex(floating.ChatColor) : floating.ChatColor ?? AppSettings.MainColor;

                    bubbleIntent.PutExtra("ChatId", floating.ChatId);
                    bubbleIntent.PutExtra("UserID", floating.UserId);
                    bubbleIntent.PutExtra("TypeChat", "User");
                    bubbleIntent.PutExtra("ColorChat", mainChatColor);
                    bubbleIntent.PutExtra("UserItem", JsonConvert.SerializeObject(new ChatObject
                    {
                        ChatType = floating.ChatType,
                        UserId = floating.UserId,
                        GroupId = floating.GroupId,
                        PageId = floating.PageId,
                        Avatar = floating.Avatar,
                        Name = floating.Name,
                        Lastseen = floating.LastSeen,
                        LastseenUnixTime = floating.LastSeenUnixTime,
                        LastMessage = new LastMessageUnion
                        {
                            LastMessageClass = new MessageData
                            {
                                Product = new ProductUnion()
                            }
                        },
                    }));
                }
                else if (floating.ChatType == "group")
                {
                    bubbleIntent = new Intent(MContext, typeof(GroupChatWindowActivity));
                    bubbleIntent.SetAction(Intent.ActionView);

                    bubbleIntent.PutExtra("ChatId", floating.ChatId);
                    bubbleIntent.PutExtra("ShowEmpty", "no");
                    bubbleIntent.PutExtra("GroupId", floating.GroupId);

                    bubbleIntent.PutExtra("GroupObject", JsonConvert.SerializeObject(new ChatObject
                    {
                        ChatType = floating.ChatType,
                        UserId = floating.UserId,
                        GroupId = floating.GroupId,
                        PageId = floating.PageId,
                        Avatar = floating.Avatar,
                        Name = floating.Name,
                        Lastseen = floating.LastSeen,
                        LastseenUnixTime = floating.LastSeenUnixTime,
                        LastMessage = new LastMessageUnion
                        {
                            LastMessageClass = new MessageData
                            {
                                Product = new ProductUnion()
                            }
                        },
                    }));
                }
                else if (floating.ChatType == "page")
                {
                    bubbleIntent = new Intent(MContext, typeof(GroupChatWindowActivity));
                    bubbleIntent.SetAction(Intent.ActionView);

                    bubbleIntent.PutExtra("ChatId", floating.ChatId);
                    bubbleIntent.PutExtra("PageId", floating.PageId);
                    bubbleIntent.PutExtra("ShowEmpty", "no");
                    bubbleIntent.PutExtra("TypeChat", "");

                    bubbleIntent.PutExtra("PageObject", JsonConvert.SerializeObject(new ChatObject
                    {
                        ChatType = floating.ChatType,
                        UserId = floating.UserId,
                        GroupId = floating.GroupId,
                        PageId = floating.PageId,
                        Avatar = floating.Avatar,
                        Name = floating.Name,
                        Lastseen = floating.LastSeen,
                        LastseenUnixTime = floating.LastSeenUnixTime,
                        LastMessage = new LastMessageUnion
                        {
                            LastMessageClass = new MessageData
                            {
                                Product = new ProductUnion()
                            }
                        },
                    }));
                }

                PendingIntent pendingIntent = PendingIntent.GetActivity(MContext, RequestBubble, bubbleIntent, Build.VERSION.SdkInt >= BuildVersionCodes.S ? (PendingIntentFlags.UpdateCurrent | PendingIntentFlags.Mutable) : PendingIntentFlags.UpdateCurrent);
                long now = Methods.Time.CurrentTimeMillis() - 100;

                Notification.Builder builder = new Notification.Builder(MContext, ChannelId)
                    .SetBubbleMetadata(CreateBubbleMetadata(icon, pendingIntent))
                    .SetContentTitle(MContext.GetString(Resource.String.Lbl_ChatHead_Title))
                    .SetContentText(MContext.GetString(Resource.String.Lbl_ChatHead_Text))
                    .SetSmallIcon(icon)
                    .SetCategory(Notification.CategoryMessage)
                    .SetShortcutId(BubbleShortcutId)
                    .SetLocusId(new LocusId(BubbleShortcutId))
                    .AddPerson(person)
                    .SetShowWhen(true)
                    .SetContentIntent(PendingIntent.GetActivity(MContext, RequestContent, bubbleIntent, Build.VERSION.SdkInt >= BuildVersionCodes.S ? (PendingIntentFlags.UpdateCurrent | PendingIntentFlags.Mutable) : PendingIntentFlags.UpdateCurrent))
                    .SetStyle(new Notification.MessagingStyle(user)
                        ?.AddMessage(new Notification.MessagingStyle.Message("send messages", now, person))
                        ?.SetGroupConversation(false))
                    .SetWhen(now);
                if (IsMinAndroidR())
                {
                    builder.AddAction(new Notification.Action.Builder(null, "Click the icon in the end ->", null).Build());
                }

                NotificationManager.Notify(BubbleNotificationId, builder.Build());
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
            }
        }

        public void DismissNotification()
        {
            try
            {
                MInstance = null;
                RunBubble = false;
                NotificationManager.Cancel(BubbleNotificationId);
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
            }
        }

        public bool AreBubblesAllowed()
        {
            try
            {
                if (!AppSettings.ShowChatHeads)
                    return false;

                if (IsMinAndroidR())
                {
                    NotificationChannel notificationChannel = NotificationManager.GetNotificationChannel(ChannelId, BubbleShortcutId);
                    return notificationChannel != null && (NotificationManager.AreBubblesAllowed() || notificationChannel.CanBubble());
                }

                int devOptions = Settings.Secure.GetInt(MContext.ContentResolver, Settings.Global.DevelopmentSettingsEnabled, 0);
                if (devOptions == 1)
                {
                    Console.WriteLine("Android bubbles are enabled");
                    return true;
                }

                Console.WriteLine("System Alert Window will not work without enabling the android bubbles");
                Toast.MakeText(MContext, "Enable android bubbles in the developer options, for System Alert Window to work", ToastLength.Short).Show();
                return false;
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
                return false;
            }
        }

        private bool IsMinAndroidR()
        {
            return Build.VERSION.SdkInt >= BuildVersionCodes.R;
        }

        private void InitNotificationManager()
        {
            try
            {
                if (NotificationManager == null)
                {
                    if (MContext == null)
                    {
                        Console.WriteLine("Context is null. Can't show the System Alert Window");
                        return;
                    }

                    NotificationManager = (NotificationManager)MContext.GetSystemService(Context.NotificationService);
                    SetUpNotificationChannels();
                }
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
            }
        }

        private void SetUpNotificationChannels()
        {
            try
            {
                if (NotificationManager.GetNotificationChannel(ChannelId) == null)
                {
                    NotificationChannel notificationChannel =
                        new NotificationChannel(ChannelId, ChannelName, NotificationImportance.High);
                    notificationChannel.Description = (ChannelDescription);
                    NotificationManager.CreateNotificationChannel(notificationChannel);
                }
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
            }
        }

        private void UpdateShortcuts(Icon icon)
        {
            try
            {
                List<string> categories = new List<string>();
                categories.Add(MContext.PackageName + ".category.TEXT_SHARE_TARGET");
                ShortcutInfo shortcutInfo = new ShortcutInfo.Builder(MContext, BubbleShortcutId)
                    .SetLocusId(new LocusId(BubbleShortcutId))
                    //.SetActivity(new ComponentName(mContext, BubbleActivity.class))
                    .SetShortLabel(ShortcutLabel)
                    .SetIcon(icon)
                    .SetLongLived(true)
                    .SetCategories(categories)
                    .SetIntent(new Intent(MContext, typeof(ChatWindowActivity)).SetAction(Intent.ActionView))
                    .SetPerson(new Person.Builder()
                        .SetName(ShortcutLabel)
                        .SetIcon(icon)
                        .Build())
                    .Build();
                ShortcutManager shortcutManager = (ShortcutManager)MContext.GetSystemService(Context.ShortcutService);
                shortcutManager.PushDynamicShortcut(shortcutInfo);
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
            }
        }

        private Notification.BubbleMetadata CreateBubbleMetadata(Icon icon, PendingIntent intent)
        {
            try
            {
                if (IsMinAndroidR())
                {
                    return new Notification.BubbleMetadata.Builder(intent, icon)
                        .SetDesiredHeight(250)
                        .SetAutoExpandBubble(true)
                        .SetSuppressNotification(true)
                        .Build();
                }

                //noinspection deprecation
                return new Notification.BubbleMetadata.Builder()
                    .SetDesiredHeight(250)
                    .SetIcon(icon)
                    .SetIntent(intent)
                    .SetAutoExpandBubble(true)
                    .SetSuppressNotification(true)
                    .Build();
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
                return null;
            }
        }

        private bool IsBubbleMode(String prefMode)
        {
            try
            {
                bool isPreferOverlay = "overlay".Equals(prefMode, StringComparison.InvariantCultureIgnoreCase);
                return IsForceAndroidBubble(MContext) || (!isPreferOverlay && ("bubble".Equals(prefMode, StringComparison.InvariantCultureIgnoreCase) || IsMinAndroidR()));
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
                return false;
            }

        }

        public static bool IsForceAndroidBubble(Context context)
        {
            try
            {
                if (Build.VERSION.SdkInt >= BuildVersionCodes.Q)
                {
                    ActivityManager activityManager =
                        (ActivityManager)context.GetSystemService(Context.ActivityService);
                    if (activityManager != null)
                    {
                        PackageManager pm = context.PackageManager;
                        return !pm.HasSystemFeature(PackageManager.FeaturePictureInPicture) ||
                               pm.HasSystemFeature(PackageManager.FeatureRamLow) || activityManager.IsLowRamDevice;
                    }

                    Console.WriteLine("Marking force android bubble as false");
                }

                return false;
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
                return false;
            }
        }

        public static readonly int ChatHeadDataRequestCode = 5599;
        public bool CheckPermission()
        {
            try
            {
                if (Build.VERSION.SdkInt <= BuildVersionCodes.Q)
                    return false;

                if (CanDrawOverlays(Application.Context))
                    return true;

                return false;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return false;
            }
        }

        public void OpenManagePermission(Activity activityContext)
        {
            try
            {
                if (CanDrawOverlays(activityContext))
                    return;

                Intent intent = new Intent(Settings.ActionManageOverlayPermission, Uri.Parse("package:" + activityContext.PackageName));
                activityContext.StartActivityForResult(intent, ChatHeadDataRequestCode);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private static bool CanDrawOverlays(Context context)
        {
            try
            {
                switch (Build.VERSION.SdkInt)
                {
                    case < BuildVersionCodes.M:
                        return true;
                    case >= BuildVersionCodes.OMr1:
                        return Settings.CanDrawOverlays(context);
                }

                if (Settings.CanDrawOverlays(context)) return true;
                try
                {
                    var mgr = (IWindowManager)context.GetSystemService(Context.WindowService);
                    if (mgr == null) return false; //getSystemService might return null 
                    View viewToAdd = new View(context);
                    var paramsParams = new WindowManagerLayoutParams(0, 0, Build.VERSION.SdkInt >= BuildVersionCodes.O ? WindowManagerTypes.ApplicationOverlay : WindowManagerTypes.SystemAlert, WindowManagerFlags.NotTouchable | WindowManagerFlags.NotFocusable, Format.Transparent);
                    viewToAdd.LayoutParameters = paramsParams;
                    mgr.AddView(viewToAdd, paramsParams);
                    mgr.RemoveView(viewToAdd);
                    return true;
                }
                catch (Exception e)
                {
                    Methods.DisplayReportResultTrack(e);
                }
                return false;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return false;
            }
        }

    }
}
