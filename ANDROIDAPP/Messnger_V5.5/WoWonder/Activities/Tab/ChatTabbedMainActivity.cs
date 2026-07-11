using Android;
using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.Graphics;
using Android.Graphics.Drawables;
using Android.OS;
using Android.Util;
using Android.Views;
using Android.Widget;
using AndroidX.AppCompat.App;
using AndroidX.AppCompat.Widget;
using AndroidX.Core.App;
using AndroidX.Core.Content;
using AndroidX.ViewPager2.Widget;
using Google.Android.Material.Dialog;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using WoWonder.Activities.Base;
using WoWonder.Activities.Broadcast;
using WoWonder.Activities.ChatWindow;
using WoWonder.Activities.Editor;
using WoWonder.Activities.FaceFilters;
using WoWonder.Activities.GroupChat;
using WoWonder.Activities.NearBy;
using WoWonder.Activities.PageChat;
using WoWonder.Activities.Request;
using WoWonder.Activities.Search;
using WoWonder.Activities.SettingsPreferences;
using WoWonder.Activities.Story;
using WoWonder.Activities.Tab.Fragment;
using WoWonder.Adapters;
using WoWonder.Frameworks.ChatHead;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Model;
using WoWonder.Helpers.Utils;
using WoWonder.Library.OneSignalNotif;
using WoWonder.Services;
using WoWonder.SQLite;
using WoWonderClient;
using WoWonderClient.Classes.Call;
using WoWonderClient.Classes.Message;
using Xamarin.Google.Android.Play.Core.Install.Model;
using Console = System.Console;
using Exception = System.Exception;

namespace WoWonder.Activities.Tab
{
    [Activity(Icon = "@mipmap/icon", Theme = "@style/MyTheme", WindowSoftInputMode = SoftInput.AdjustNothing | SoftInput.AdjustPan, ConfigurationChanges = ConfigChanges.Locale | ConfigChanges.UiMode | ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize)]
    public class ChatTabbedMainActivity : BaseActivity
    {
        #region Variables

        private static ChatTabbedMainActivity Instance;

        private LinearLayout AppBarLayout;

        public ViewPager2 ViewPager;
        private MainTabAdapter TabAdapter;
        public TabChatFragment ChatTab;
        public LastStoriesFragment LastStoriesTab;
        public LastCallsFragment LastCallsTab;

        private TextView TxtAppName;
        private ImageView DiscoverImageView, SearchImageView, MoreImageView;

        private BottomNavigationTabChat BottomNavigationTab;

        private PowerManager.WakeLock Wl;
        private Handler ExitHandler;
        private bool RecentlyBackPressed;

        private PopupWindow PopupWindow;

        #endregion

        #region General

        protected override void OnCreate(Bundle savedInstanceState)
        {
            try
            {
                base.OnCreate(savedInstanceState);
                Delegate.SetLocalNightMode(WoWonderTools.IsTabDark() ? AppCompatDelegate.ModeNightYes : AppCompatDelegate.ModeNightNo);
                SetTheme(WoWonderTools.IsTabDark() ? Resource.Style.MyTheme_Dark : Resource.Style.MyTheme);

                Methods.App.FullScreenApp(this);

                Instance = this;
                //RunCall = false;

                // Create your application here
                SetContentView(Resource.Layout.TabbedMainChatLayout);

                Task.Run(() => { MainApplication.GetInstance().SecondRunExcite(this); });

                GetGeneralAppData();

                //Get Value And Set Toolbar
                InitComponent();
                AddFragmentsTabs();
                InitBackPressed("ChatTabbedMainActivity");

                SetService();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        protected override void OnResume()
        {
            try
            {
                base.OnResume();
                AddOrRemoveEvent(true);
                LastStoriesTab?.AdManagerAdView?.Resume();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        protected override void OnPause()
        {
            try
            {
                AddOrRemoveEvent(false);
                LastStoriesTab?.AdManagerAdView?.Pause();
                base.OnPause();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        protected override void OnDestroy()
        {
            try
            {
                LastStoriesTab?.AdManagerAdView?.Destroy();

                if (AppSettings.ConnectionTypeChat == InitializeWoWonder.ConnectionType.Socket)
                    UserDetails.Socket?.Emit_loggedoutEvent(UserDetails.AccessToken);

                base.OnDestroy();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Back Pressed

        public void BackPressed()
        {
            try
            {
                ExitHandler ??= new Handler(Looper.MainLooper);
                if (RecentlyBackPressed)
                {
                    ExitHandler.RemoveCallbacks(() => { RecentlyBackPressed = false; });
                    RecentlyBackPressed = false;
                    MoveTaskToBack(true);
                    //Finish();
                }
                else
                {
                    RecentlyBackPressed = true;
                    ToastUtils.ShowToast(this, GetString(Resource.String.press_again_exit), ToastLength.Long);
                    ExitHandler.PostDelayed(() => { RecentlyBackPressed = false; }, 2000L);
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Functions

        private void InitComponent()
        {
            try
            {
                TabAdapter = new MainTabAdapter(this);
                ViewPager = FindViewById<ViewPager2>(Resource.Id.viewpager);
                AppBarLayout = FindViewById<LinearLayout>(Resource.Id.appbar);
                AppBarLayout.SetBackgroundColor(WoWonderTools.IsTabDark() ? Color.Black : Color.White);

                TxtAppName = FindViewById<TextView>(Resource.Id.appName);
                TxtAppName.Text = AppSettings.ApplicationName;

                DiscoverImageView = FindViewById<ImageView>(Resource.Id.discoverButton);
                MoreImageView = FindViewById<ImageView>(Resource.Id.MoreButton);
                SearchImageView = FindViewById<ImageView>(Resource.Id.searchButton);

                BottomNavigationTab = new BottomNavigationTabChat(this);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void AddOrRemoveEvent(bool addEvent)
        {
            try
            {
                // true +=  // false -=
                if (addEvent)
                {
                    DiscoverImageView.Click += DiscoverImageViewOnClick;
                    SearchImageView.Click += SearchImageViewOnClick;
                    MoreImageView.Click += MoreImageViewOnClick;
                }
                else
                {
                    DiscoverImageView.Click -= DiscoverImageViewOnClick;
                    SearchImageView.Click -= SearchImageViewOnClick;
                    MoreImageView.Click -= MoreImageViewOnClick;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public static ChatTabbedMainActivity GetInstance()
        {
            try
            {
                return Instance;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return null!;
            }
        }

        #endregion

        #region Events

        private void MoreImageViewOnClick(object sender, EventArgs e)
        {
            try
            {
                LayoutInflater layoutInflater = (LayoutInflater)GetSystemService(LayoutInflaterService);
                View popupView = layoutInflater?.Inflate(Resource.Layout.MoreTabbedMainLayout, null);

                int px = (int)TypedValue.ApplyDimension(ComplexUnitType.Dip, 180, Resources.DisplayMetrics);
                PopupWindow = new PopupWindow(popupView, px, ViewGroup.LayoutParams.WrapContent);

                var RequestLayout = popupView.FindViewById<TextView>(Resource.Id.RequestLayout);
                var BroadcastLayout = popupView.FindViewById<TextView>(Resource.Id.BroadcastLayout);

                RequestLayout.Click += RequestLayoutOnClick;
                BroadcastLayout.Click += BroadcastLayoutOnClick;

                PopupWindow.SetBackgroundDrawable(new ColorDrawable());
                PopupWindow.Focusable = true;
                PopupWindow.ClippingEnabled = true;
                PopupWindow.OutsideTouchable = false;
                PopupWindow.DismissEvent += delegate (object sender, EventArgs args)
                {
                    try
                    {
                        PopupWindow.Dismiss();
                    }
                    catch (Exception exception)
                    {
                        Methods.DisplayReportResultTrack(exception);
                    }
                };

                PopupWindow.ShowAsDropDown(MoreImageView);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void BroadcastLayoutOnClick(object sender, EventArgs e)
        {
            try
            {
                StartActivity(new Intent(this, typeof(BroadcastActivity)));

                PopupWindow.Dismiss();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void RequestLayoutOnClick(object sender, EventArgs e)
        {
            try
            {
                StartActivity(new Intent(this, typeof(RequestActivity)));

                PopupWindow.Dismiss();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void SearchImageViewOnClick(object sender, EventArgs e)
        {
            try
            {
                var intent = new Intent(this, typeof(SearchActivity));
                intent.PutExtra("Key", "");
                StartActivity(intent);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void DiscoverImageViewOnClick(object sender, EventArgs e)
        {
            try
            {
                StartActivity(new Intent(this, typeof(PeopleNearByActivity)));
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Set Tab

        private void AddFragmentsTabs()
        {
            try
            {
                TabAdapter.ClaerFragment();

                ChatTab = new TabChatFragment();
                LastStoriesTab = new LastStoriesFragment(this);
                LastCallsTab = new LastCallsFragment();

                if (TabAdapter is { ItemCount: <= 0 })
                {
                    TabAdapter.AddFragment(ChatTab, GetText(Resource.String.Lbl_Tab_Chats));
                    TabAdapter.AddFragment(LastStoriesTab, GetText(Resource.String.Lbl_Tab_Stories));
                    TabAdapter.AddFragment(LastCallsTab, GetText(Resource.String.Lbl_Tab_Calls));

                    ViewPager.UserInputEnabled = false;
                    ViewPager.CurrentItem = TabAdapter.ItemCount;
                    ViewPager.OffscreenPageLimit = TabAdapter.ItemCount;

                    ViewPager.Orientation = ViewPager2.OrientationHorizontal;
                    ViewPager.RegisterOnPageChangeCallback(new MyOnPageChangeCallback(this));
                    ViewPager.Adapter = TabAdapter;
                    ViewPager.Adapter.NotifyDataSetChanged();
                }

                BottomNavigationTab.SelectItem(0);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private class MyOnPageChangeCallback : ViewPager2.OnPageChangeCallback
        {
            private readonly ChatTabbedMainActivity Activity;

            public MyOnPageChangeCallback(ChatTabbedMainActivity activity)
            {
                try
                {
                    Activity = activity;
                }
                catch (Exception exception)
                {
                    Methods.DisplayReportResultTrack(exception);
                }
            }

            public override void OnPageSelected(int position)
            {
                try
                {
                    base.OnPageSelected(position);
                    switch (position)
                    {
                        case < 0:
                            return;
                        // Chats
                        case 0:
                            {
                                Activity.BottomNavigationTab.SelectItem(0);
                                break;
                            }
                        // Stories
                        case 1:
                            {
                                Activity.BottomNavigationTab.SelectItem(1);

                                break;
                            }
                        // Calls
                        case 2:
                            {
                                Activity.BottomNavigationTab.SelectItem(2);

                                break;
                            }
                        // More_Tab
                        case 3:
                            {

                                break;
                            }
                    }
                }
                catch (Exception exception)
                {
                    Methods.DisplayReportResultTrack(exception);
                }
            }
        }

        #endregion

        #region Permissions && Result

        //Result
        protected override void OnActivityResult(int requestCode, Result resultCode, Intent data)
        {
            try
            {
                base.OnActivityResult(requestCode, resultCode, data);

                if (requestCode == PixImagePickerActivity.RequestCode && resultCode == Result.Ok)
                {
                    var listPath = JsonConvert.DeserializeObject<ResultIntentPixImage>(data.GetStringExtra("ResultPixImage") ?? "");
                    if (listPath?.List?.Count > 0)
                    {
                        var filepath = listPath.List.FirstOrDefault();
                        if (!string.IsNullOrEmpty(filepath))
                        {
                            AddStory(filepath);
                        }
                    }
                }
                else if (requestCode == 500 && resultCode == Result.Ok)
                {
                    var filepath = Methods.AttachmentFiles.GetActualPathFromFile(this, data.Data);
                    if (filepath != null)
                    {
                        AddStory(filepath);
                    }
                }
                else if (requestCode == 2200 && resultCode == Result.Ok)
                {
                    var imagePath = data.GetStringExtra("ImagePath") ?? "Data not available";
                    if (imagePath != "Data not available" && !string.IsNullOrEmpty(imagePath))
                    {
                        AddStory(imagePath);
                    }
                }
                else if (requestCode == 3200 && resultCode == Result.Ok)
                {
                    var filepath = data.GetStringExtra("FilePath") ?? "Data not available";
                    if (filepath != "Data not available" && !string.IsNullOrEmpty(filepath))
                    {
                        AddStory(filepath);
                    }
                }
                else if (requestCode == 4711)
                {
                    switch (resultCode)
                    {
                        case Result.Ok:
                            {
                                // In app update success
                                if (UpdateManagerApp.AppUpdateTypeSupported == AppUpdateType.Immediate) ToastUtils.ShowToast(this, "App updated", ToastLength.Short);
                                break;
                            }
                        case Result.Canceled:
                            ToastUtils.ShowToast(this, "In app update cancelled", ToastLength.Short);
                            break;
                        case (Result)ActivityResult.ResultInAppUpdateFailed:
                            ToastUtils.ShowToast(this, "In app update failed", ToastLength.Short);
                            break;
                    }
                }
                else if (requestCode == ChatHeadHelper.ChatHeadDataRequestCode)
                {
                    var instance = ChatHeadHelper.GetInstance(this);
                    if (instance.CheckPermission())
                    {
                        //instance.ShowNotification(ChatHeadObject);

                        UserDetails.ChatHead = true;
                    }
                    else
                    {

                        UserDetails.ChatHead = false;
                    }
                    MainSettings.SharedData?.Edit()?.PutBoolean("chatheads_key", UserDetails.ChatHead)?.Commit();
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        //Permissions
        public override void OnRequestPermissionsResult(int requestCode, string[] permissions, Permission[] grantResults)
        {
            try
            {
                Xamarin.Essentials.Platform.OnRequestPermissionsResult(requestCode, permissions, grantResults);
                base.OnRequestPermissionsResult(requestCode, permissions, grantResults);

                switch (requestCode)
                {
                    case 108 when grantResults.Length > 0 && grantResults[0] == Permission.Granted: // add story
                        PixImagePickerUtils.OpenDialogGallery(this, true);
                        break;
                    case 108:
                        ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_Permission_is_denied), ToastLength.Long);
                        break;
                    case 110 when grantResults.Length > 0 && grantResults[0] == Permission.Granted:
                        Window?.AddFlags(WindowManagerFlags.KeepScreenOn);
                        break;
                    case 110:
                        ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_Permission_is_denied), ToastLength.Long);
                        break;
                    case 100 when grantResults.Length > 0 && grantResults[0] == Permission.Granted:
                        Methods.Path.Chack_MyFolder();
                        break;
                    case 100:
                        ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_Permission_is_denied), ToastLength.Long);
                        break;
                    case 102 when grantResults.Length > 0 && grantResults[0] == Permission.Granted:
                        LastCallsTab.StartCall(TypeCall.Audio, LastCallsTab.DataUser);
                        break;
                    case 102:
                        ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_Permission_is_denied), ToastLength.Long);
                        break;
                    case 103 when grantResults.Length > 0 && grantResults[0] == Permission.Granted:

                        switch (LastCallsTab.TypeCallSelected)
                        {
                            case "Video":
                                LastCallsTab.StartCall(TypeCall.Video, LastCallsTab.DataUser);
                                break;
                            case "Audio":
                                LastCallsTab.StartCall(TypeCall.Audio, LastCallsTab.DataUser);
                                break;
                        }

                        break;
                    case 103:
                        ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_Permission_is_denied), ToastLength.Long);
                        break;
                    case 16248 when grantResults.Length > 0 && grantResults[0] == Permission.Granted:
                        if (string.IsNullOrEmpty(UserDetails.DeviceId))
                            OneSignalNotification.Instance.RegisterNotificationDevice(this);
                        break;
                    case 16248:
                        ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_Permission_is_denied), ToastLength.Long);
                        break;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Service

        private void SetService(bool run = true)
        {
            try
            {
                if (run)
                {
                    // reschedule the job 
                    AppApiService.GetInstance()?.StartForegroundService(this);
                }
                else
                {
                    // Cancel all jobs
                    AppApiService.GetInstance()?.StopJob(this);
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region General App Data

        private void GetGeneralAppData()
        {
            try
            {
                var sqlEntity = new SqLiteDatabase();

                RunOnUiThread(() =>
                {
                    var instance = ChatHeadHelper.GetInstance(this);
                    if (!instance.CheckPermission())
                        DisplayChatHeadDialog();
                });

                var settingsData = sqlEntity.GetSettings();
                if (settingsData != null)
                    ListUtils.SettingsSiteList = settingsData;

                sqlEntity.Get_MyProfile();

                ListUtils.StickersList = sqlEntity.Get_From_StickersTb();

                if (Methods.CheckConnectivity())
                    PollyController.RunRetryPolicyFunction(new List<Func<Task>> { ApiRequest.GetPinChats, () => ApiRequest.GetSettings_Api(this), ApiRequest.Get_MyProfileData_Api });

                InAppUpdate();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void GetOneSignalNotification()
        {
            try
            {
                string userId = Intent?.GetStringExtra("userId") ?? "";
                string pageId = Intent?.GetStringExtra("PageId") ?? "";
                string groupId = Intent?.GetStringExtra("GroupId") ?? "";
                string type = Intent?.GetStringExtra("type") ?? "";

                Intent intent = null!;
                switch (type)
                {
                    case "user":
                        {
                            var item = ChatTab?.LastChatTab?.MAdapter?.LastChatsList?.FirstOrDefault(a => a.LastChat?.UserId == userId && a.LastChat?.ChatType == "user");
                            string mainChatColor = AppSettings.MainColor;

                            intent = new Intent(this, typeof(ChatWindowActivity));
                            intent.PutExtra("UserID", userId);
                            intent.PutExtra("ShowEmpty", "no");

                            if (item?.LastChat != null)
                            {
                                if (!ChatTools.ChatIsAllowed(item.LastChat))
                                    return;

                                if (item.LastChat.LastMessage.LastMessageClass != null)
                                    mainChatColor = item.LastChat.LastMessage.LastMessageClass.ChatColor.Contains("rgb") ? Methods.FunString.ConvertColorRgBtoHex(item.LastChat.LastMessage.LastMessageClass.ChatColor) : item.LastChat.LastMessage.LastMessageClass.ChatColor ?? AppSettings.MainColor;

                                intent.PutExtra("TypeChat", "LastMessenger");
                                intent.PutExtra("ChatId", item.LastChat.ChatId);
                                intent.PutExtra("ColorChat", mainChatColor);
                                intent.PutExtra("UserItem", JsonConvert.SerializeObject(item.LastChat));
                            }
                            else
                            {
                                intent.PutExtra("TypeChat", "OneSignalNotification");
                                intent.PutExtra("ColorChat", mainChatColor);
                            }
                            break;
                        }
                    case "page":
                        {
                            Classes.LastChatsClass item = ChatTab?.LastChatTab?.MAdapter?.LastChatsList?.FirstOrDefault(a => a.LastChat?.PageId == pageId && a.LastChat?.ChatType == "page");

                            intent = new Intent(this, typeof(PageChatWindowActivity));
                            intent.PutExtra("ShowEmpty", "no");
                            intent.PutExtra("PageId", pageId);

                            if (item?.LastChat != null)
                            {
                                intent.PutExtra("ChatId", item.LastChat.ChatId);
                                intent.PutExtra("PageObject", JsonConvert.SerializeObject(item.LastChat));
                                intent.PutExtra("TypeChat", "");
                            }
                            break;
                        }
                    case "group":
                        {
                            Classes.LastChatsClass item = ChatTab?.LastGroupChatsTab?.MAdapter?.LastChatsList?.FirstOrDefault(a => a.LastChat?.GroupId == groupId);

                            intent = new Intent(this, typeof(GroupChatWindowActivity));
                            intent.PutExtra("ShowEmpty", "no");
                            intent.PutExtra("GroupId", groupId);

                            if (item?.LastChat != null)
                            {
                                intent.PutExtra("ChatId", item.LastChat.ChatId);
                                intent.PutExtra("GroupObject", JsonConvert.SerializeObject(item.LastChat));
                            }

                            break;
                        }
                    case "call_audio":
                    case "call_video":
                        {
                            if (Methods.CheckConnectivity())
                                PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => AppUpdaterHelper.LoadChatAsync(true) });

                            break;
                        }
                }

                if (intent != null)
                    StartActivity(intent);

                if (Build.VERSION.SdkInt >= BuildVersionCodes.Tiramisu)
                {
                    if (ContextCompat.CheckSelfPermission(this, Manifest.Permission.PostNotifications) == Permission.Granted)
                    {
                        if (string.IsNullOrEmpty(UserDetails.DeviceId))
                            OneSignalNotification.Instance.RegisterNotificationDevice(this);
                    }
                    else
                    {
                        ActivityCompat.RequestPermissions(this, new[]
                        {
                            Manifest.Permission.PostNotifications
                        }, 16248);
                    }
                }
                else
                {
                    if (string.IsNullOrEmpty(UserDetails.DeviceId))
                        OneSignalNotification.Instance.RegisterNotificationDevice(this);
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void InAppUpdate()
        {
            RunOnUiThread(() =>
            {
                try
                {
                    if (AppSettings.ShowSettingsUpdateManagerApp)
                        UpdateManagerApp.CheckUpdateApp(this, 4711, Intent);
                }
                catch (Exception e)
                {
                    Methods.DisplayReportResultTrack(e);
                }
            });
        }

        private static int CountRateApp;
        public void InAppReview()
        {
            try
            {
                bool inAppReview = MainSettings.InAppReview?.GetBoolean(MainSettings.PrefKeyInAppReview, false) ?? false;
                if (!inAppReview && AppSettings.ShowSettingsRateApp)
                {
                    if (CountRateApp == AppSettings.ShowRateAppCount)
                    {
                        var dialog = new MaterialAlertDialogBuilder(this);
                        dialog.SetTitle(GetText(Resource.String.Lbl_RateOurApp));
                        dialog.SetMessage(GetText(Resource.String.Lbl_RateOurAppContent));
                        dialog.SetPositiveButton(GetText(Resource.String.Lbl_Rate), (materialDialog, action) =>
                        {
                            try
                            {
                                StoreReviewApp store = new StoreReviewApp();
                                store.OpenStoreReviewPage(this, PackageName);
                            }
                            catch (Exception e)
                            {
                                Methods.DisplayReportResultTrack(e);
                            }
                        });
                        dialog.SetNegativeButton(GetText(Resource.String.Lbl_Close), new MaterialDialogUtils());

                        dialog.Show();

                        MainSettings.InAppReview?.Edit()?.PutBoolean(MainSettings.PrefKeyInAppReview, true)?.Commit();
                    }
                    else
                    {
                        CountRateApp++;
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Story

        public void OnImage_Button_Click()
        {
            try
            {
                PixImagePickerUtils.OpenDialogGallery(this, true);
            }
            catch (Exception exe)
            {
                Methods.DisplayReportResultTrack(exe);
            }
        }

        public void OpenEditColor()
        {
            try
            {
                Intent intent = new Intent(this, typeof(EditColorActivity));
                StartActivityForResult(intent, 2200);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnCamera_Button_Click()
        {
            try
            {
                Intent intent = new Intent(this, typeof(FaceFiltersActivity));
                StartActivityForResult(intent, 3200);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void AddStory(string filepath)
        {
            try
            {
                if (!string.IsNullOrEmpty(filepath))
                {
                    var type = Methods.AttachmentFiles.Check_FileExtension(filepath);
                    if (type == "Video")
                    {
                        Intent intent = new Intent(this, typeof(VideoEditorActivity));
                        intent.PutExtra("Uri", filepath);
                        intent.PutExtra("Thumbnail", filepath);
                        intent.PutExtra("Type", "Story");
                        StartActivity(intent);
                    }
                    else if (type == "Image")
                    {
                        //Do something with your Uri
                        Intent intent = new Intent(this, typeof(AddStoryActivity));
                        intent.PutExtra("Uri", filepath);
                        intent.PutExtra("Type", "image");
                        StartActivity(intent);
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region WakeLock System

        public void AddFlagsWakeLock()
        {
            try
            {
                if ((int)Build.VERSION.SdkInt < 23)
                {
                    Window.AddFlags(WindowManagerFlags.KeepScreenOn);
                }
                else
                {
                    if (CheckSelfPermission(Manifest.Permission.WakeLock) == Permission.Granted)
                    {
                        Window.AddFlags(WindowManagerFlags.KeepScreenOn);
                    }
                    else
                    {
                        //request Code 110
                        new PermissionsController(this).RequestPermission(110);
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void SetWakeLock()
        {
            try
            {
                if (Wl == null)
                {
                    PowerManager pm = (PowerManager)GetSystemService(PowerService);
                    Wl = pm?.NewWakeLock(WakeLockFlags.ScreenBright, "My Tag");
                    Wl?.Acquire();
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void SetOnWakeLock()
        {
            try
            {
                PowerManager pm = (PowerManager)GetSystemService(PowerService);
                Wl = pm?.NewWakeLock(WakeLockFlags.ScreenBright, "My Tag");
                Wl?.Acquire();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void SetOffWakeLock()
        {
            try
            {
                PowerManager pm = (PowerManager)GetSystemService(PowerService);
                Wl = pm?.NewWakeLock(WakeLockFlags.ProximityScreenOff, "My Tag");
                Wl?.Acquire();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OffWakeLock()
        {
            try
            {
                // ..screen will stay on during this section..
                Wl?.Release();
                Wl = null!;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Chat Head

        private Dialog ChatHeadWindow;
        private void DisplayChatHeadDialog()
        {
            try
            {
                if (AppSettings.ShowChatHeads)
                {
                    UserDetails.OpenDialog = MainSettings.SharedData.GetBoolean("OpenDialogChatHead_key", false);

                    if (UserDetails.OpenDialog) return;

                    ChatHeadWindow = new Dialog(this, WoWonderTools.IsTabDark() ? Resource.Style.MyTheme_Dark : Resource.Style.MyTheme);
                    ChatHeadWindow.SetContentView(Resource.Layout.ChatHeadDialogLayout);

                    var subTitle1 = ChatHeadWindow.FindViewById<TextView>(Resource.Id.subTitle1);
                    var btnNotNow = ChatHeadWindow.FindViewById<TextView>(Resource.Id.notNowButton);
                    var btnGoToSettings = ChatHeadWindow.FindViewById<AppCompatButton>(Resource.Id.goToSettingsButton);

                    subTitle1.Text = GetText(Resource.String.Lbl_EnableChatHead_SubTitle1) + " " + AppSettings.ApplicationName + ", " + GetText(Resource.String.Lbl_EnableChatHead_SubTitle2);

                    btnNotNow.Click += BtnNotNowOnClick;
                    btnGoToSettings.Click += BtnGoToSettingsOnClick;

                    ChatHeadWindow.Show();

                    UserDetails.OpenDialog = true;
                    MainSettings.SharedData?.Edit()?.PutBoolean("OpenDialogChatHead_key", true)?.Commit();
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void BtnGoToSettingsOnClick(object sender, EventArgs e)
        {
            try
            {
                var instance = ChatHeadHelper.GetInstance(this);
                if (!instance.CheckPermission())
                    instance.OpenManagePermission(this);

                if (ChatHeadWindow != null)
                {
                    ChatHeadWindow.Hide();
                    ChatHeadWindow.Dispose();
                    ChatHeadWindow = null!;
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void BtnNotNowOnClick(object sender, EventArgs e)
        {
            try
            {
                if (ChatHeadWindow != null)
                {
                    ChatHeadWindow.Hide();
                    ChatHeadWindow.Dispose();
                    ChatHeadWindow = null!;
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Call

        public static void AddCallToListAndSend(string type, string typeStatus, TypeCall typeCall, CallUserObject callUserObject)
        {
            try
            {
                //var unixTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                var timeNow = DateTime.Now.ToString("MMMM dd, H:mm tt");

                Classes.CallUser cv = new Classes.CallUser
                {
                    Id = callUserObject.Data.Id,
                    UserId = callUserObject.UserId,
                    Avatar = callUserObject.Avatar,
                    Name = callUserObject.Name,
                    FromId = callUserObject.Data.FromId,
                    Active = callUserObject.Data.Active,
                    Time = typeStatus + " • " + timeNow,
                    Status = typeStatus,
                    RoomName = callUserObject.Data.RoomName,
                    Type = typeCall,
                    TypeIcon = type,
                    TypeColor = "#008000"
                };

                SqLiteDatabase dbDatabase = new SqLiteDatabase();
                dbDatabase.Insert_CallUser(cv);

                var ckd = Instance?.LastCallsTab?.MAdapter?.MCallUser?.FirstOrDefault(a => a.Id == callUserObject.Data.Id); // id >> Call_Id
                if (ckd == null)
                {
                    Instance?.LastCallsTab?.MAdapter?.MCallUser?.Insert(0, cv);
                    Instance?.LastCallsTab?.MAdapter?.NotifyDataSetChanged();
                }
                else
                {
                    ckd = cv;
                    ckd.Id = cv.Id;
                    Instance?.LastCallsTab?.MAdapter?.NotifyDataSetChanged();
                }
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
            }
        }

        #endregion

    }
}