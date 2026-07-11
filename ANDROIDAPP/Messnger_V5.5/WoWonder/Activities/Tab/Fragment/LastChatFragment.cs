using Android.App;
using Android.Content;
using Android.Graphics;
using Android.OS;
using Android.Views;
using Android.Widget;
using AndroidX.RecyclerView.Widget;
using AndroidX.SwipeRefreshLayout.Widget;
using Bumptech.Glide.Util;
using Com.Google.Android.Gms.Ads;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using WoWonder.Activities.Broadcast;
using WoWonder.Activities.Call.Tools;
using WoWonder.Activities.ChatWindow;
using WoWonder.Activities.GroupChat;
using WoWonder.Activities.PageChat;
using WoWonder.Activities.Tab.Adapter;
using WoWonder.Frameworks.ChatHead;
using WoWonder.Helpers.Ads;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Model;
using WoWonder.Helpers.ShimmerUtils;
using WoWonder.Helpers.Utils;
using WoWonder.Library.Anjo.IntegrationRecyclerView;
using WoWonder.SocketSystem;
using WoWonder.SQLite;
using WoWonderClient;
using WoWonderClient.Classes.Call;
using WoWonderClient.Classes.Message;
using WoWonderClient.Requests;
using static WoWonder.Adapters.Holders;
using Exception = System.Exception;

namespace WoWonder.Activities.Tab.Fragment
{
    public class LastChatFragment : AndroidX.Fragment.App.Fragment
    {
        #region Variables Basic

        public LastChatsAdapter MAdapter;
        private SwipeRefreshLayout SwipeRefreshLayout;
        private RecyclerView MRecycler;
        private LinearLayoutManager LayoutManager;
        private RecyclerViewOnScrollListener MainScrollEvent;
        private ChatTabbedMainActivity GlobalContext;
        public static bool ApiRun;
        private static bool NoMoreUser;

        private ViewStub ShimmerPageLayout;
        private View InflatedShimmer;
        private TemplateShimmerInflater ShimmerInflater;
        private AdView MAdView;

        #endregion

        #region General

        public override void OnCreate(Bundle savedInstanceState)
        {
            base.OnCreate(savedInstanceState);
            // Create your fragment here
            GlobalContext = (ChatTabbedMainActivity)Activity;
        }

        public override View OnCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState)
        {
            try
            {
                View view = inflater.Inflate(Resource.Layout.TLastMessagesLayout, container, false);
                return view;
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
                return null!;
            }
        }

        public override void OnViewCreated(View view, Bundle savedInstanceState)
        {
            try
            {
                base.OnViewCreated(view, savedInstanceState);

                InitComponent(view);
                InitShimmer(view);
                SetRecyclerViewAdapters();

                LoadChat();
                GlobalContext?.GetOneSignalNotification();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override void OnResume()
        {
            try
            {
                base.OnResume();
                AdsGoogle.LifecycleAdView(MAdView, "Resume");
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override void OnPause()
        {
            try
            {
                base.OnPause();
                AdsGoogle.LifecycleAdView(MAdView, "Pause");
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override void OnLowMemory()
        {
            try
            {
                GC.Collect(GC.MaxGeneration);
                base.OnLowMemory();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        public override void OnDestroy()
        {
            try
            {
                AdsGoogle.LifecycleAdView(MAdView, "Destroy");
                base.OnDestroy();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Functions

        private void InitComponent(View view)
        {
            try
            {
                MRecycler = (RecyclerView)view.FindViewById(Resource.Id.recyler);
                SwipeRefreshLayout = (SwipeRefreshLayout)view.FindViewById(Resource.Id.swipeRefreshLayout);

                SwipeRefreshLayout.SetColorSchemeResources(Android.Resource.Color.HoloBlueLight, Android.Resource.Color.HoloGreenLight, Android.Resource.Color.HoloOrangeLight, Android.Resource.Color.HoloRedLight);
                SwipeRefreshLayout.Refreshing = false;
                SwipeRefreshLayout.Enabled = true;
                SwipeRefreshLayout.SetProgressBackgroundColorSchemeColor(WoWonderTools.IsTabDark() ? Color.ParseColor("#424242") : Color.ParseColor("#f7f7f7"));
                SwipeRefreshLayout.Refresh += SwipeRefreshLayoutOnRefresh;

                MAdView = view.FindViewById<AdView>(Resource.Id.adView);
                AdsGoogle.InitAdView(MAdView, MRecycler);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void InitShimmer(View view)
        {
            try
            {
                ShimmerPageLayout = view.FindViewById<ViewStub>(Resource.Id.viewStubShimmer);
                InflatedShimmer ??= ShimmerPageLayout?.Inflate();

                ShimmerInflater = new TemplateShimmerInflater();
                ShimmerInflater.InflateLayout(Activity, InflatedShimmer, ShimmerTemplateStyle.UsersTemplate);
                ShimmerInflater.Show();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void SetRecyclerViewAdapters()
        {
            try
            {
                MAdapter = new LastChatsAdapter(Activity, "user") { LastChatsList = new ObservableCollection<Classes.LastChatsClass>() };
                MAdapter.ItemClick += MAdapterOnItemClick;
                MAdapter.ItemLongClick += MAdapterOnItemLongClick;

                LayoutManager = new LinearLayoutManager(Activity);
                MRecycler.SetLayoutManager(LayoutManager);
                MRecycler.HasFixedSize = true;
                MRecycler.SetItemViewCacheSize(10);
                MRecycler.GetLayoutManager().ItemPrefetchEnabled = true;
                //MRecycler.SetItemAnimator(null);

                var sizeProvider = new ViewPreloadSizeProvider();
                var preLoader = new RecyclerViewPreloader<ChatObject>(Activity, MAdapter, sizeProvider, 10);
                MRecycler.AddOnScrollListener(preLoader);
                MRecycler.SetAdapter(MAdapter);

                RecyclerViewOnScrollListener xamarinRecyclerViewOnScrollListener = new RecyclerViewOnScrollListener(LayoutManager);
                MainScrollEvent = xamarinRecyclerViewOnScrollListener;
                MainScrollEvent.LoadMoreEvent += MainScrollEventOnLoadMoreEvent;
                MRecycler.AddOnScrollListener(xamarinRecyclerViewOnScrollListener);
                MainScrollEvent.IsLoading = false;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Events 

        //Scroll
        private void MainScrollEventOnLoadMoreEvent(object sender, EventArgs e)
        {
            try
            {
                Console.WriteLine("Last Chat ======== LoadMore");
                //Code get last id where LoadMore >>
                var idUser = MAdapter?.LastChatsList?.LastOrDefault(a => a.Type == Classes.ItemType.LastChatNewV && a.LastChat?.ChatType == "user")?.LastChat?.ChatTime ?? "0";
                var idGroup = MAdapter?.LastChatsList?.LastOrDefault(a => a.Type == Classes.ItemType.LastChatNewV && a.LastChat?.ChatType == "group")?.LastChat?.ChatTime ?? "0";
                var idPage = MAdapter?.LastChatsList?.LastOrDefault(a => a.Type == Classes.ItemType.LastChatNewV && a.LastChat?.ChatType == "page")?.LastChat?.ChatTime ?? "0";
                if (idUser != "0" && !string.IsNullOrEmpty(idUser) && idGroup != "0" && !string.IsNullOrEmpty(idGroup) && idPage != "0" && !string.IsNullOrEmpty(idPage) && !MainScrollEvent.IsLoading)
                    PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => LoadChatAsync(false, idUser, idGroup, idPage) });
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //Refresh
        private void SwipeRefreshLayoutOnRefresh(object sender, EventArgs e)
        {
            try
            {
                ShimmerInflater.Show();

                MainScrollEvent.IsLoading = false;
                ApiRun = false;
                NoMoreUser = false;

                if (!Methods.CheckConnectivity())
                {
                    ToastUtils.ShowToast(Activity, Activity.GetText(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);

                    if (SwipeRefreshLayout.Refreshing)
                        SwipeRefreshLayout.Refreshing = false;
                }
                else
                {
                    MAdapter?.LastChatsList?.Clear();
                    MAdapter?.NotifyDataSetChanged();
                    ListUtils.UserList.Clear();

                    SqLiteDatabase dbDatabase = new SqLiteDatabase();
                    dbDatabase.ClearAll_LastUsersChat();
                    dbDatabase.ClearAll_Messages();

                    StartApiService();
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void MAdapterOnItemClick(object sender, GlobalClickEventArgs e)
        {
            try
            {
                var position = e.Position;
                if (position >= 0)
                {
                    var item = MAdapter.GetItem(position);
                    if (item != null)
                    {
                        switch (item.Type)
                        {
                            case Classes.ItemType.LastChatNewV:
                                {
                                    if (item.LastChat.LastMessage.LastMessageClass != null && item.LastChat.LastMessage.LastMessageClass.Seen == "0" && item.LastChat.LastMessage.LastMessageClass.ToId == UserDetails.UserId && item.LastChat.LastMessage.LastMessageClass.FromId != UserDetails.UserId)
                                    {
                                        item.LastChat.LastMessage.LastMessageClass.Seen = "1";
                                        Activity?.RunOnUiThread(() => { MAdapter?.NotifyItemChanged(position); });

                                        SqLiteDatabase dbDatabase = new SqLiteDatabase();
                                        dbDatabase.Insert_Or_Update_one_LastUsersChat(item.LastChat);
                                    }

                                    Intent intent = null!;
                                    switch (item.LastChat.ChatType)
                                    {
                                        case "user":

                                            string mainChatColor = AppSettings.MainColor;
                                            if (item.LastChat.LastMessage.LastMessageClass != null)
                                                mainChatColor = item.LastChat.LastMessage.LastMessageClass.ChatColor.Contains("rgb") ? Methods.FunString.ConvertColorRgBtoHex(item.LastChat.LastMessage.LastMessageClass.ChatColor) : item.LastChat.LastMessage.LastMessageClass.ChatColor ?? AppSettings.MainColor;

                                            if (!ChatTools.ChatIsAllowed(item.LastChat))
                                                return;

                                            intent = new Intent(Context, typeof(ChatWindowActivity));
                                            intent.PutExtra("ChatId", item.LastChat.ChatId);
                                            intent.PutExtra("UserID", item.LastChat.UserId);
                                            intent.PutExtra("TypeChat", "LastMessenger");
                                            intent.PutExtra("ShowEmpty", "no");
                                            intent.PutExtra("ColorChat", mainChatColor);
                                            intent.PutExtra("UserItem", JsonConvert.SerializeObject(item.LastChat));
                                            break;
                                        case "page":
                                            intent = new Intent(Context, typeof(PageChatWindowActivity));
                                            intent.PutExtra("ChatId", item.LastChat.ChatId);
                                            intent.PutExtra("PageId", item.LastChat.PageId);
                                            intent.PutExtra("ShowEmpty", "no");
                                            intent.PutExtra("TypeChat", "");
                                            intent.PutExtra("PageObject", JsonConvert.SerializeObject(item.LastChat));
                                            break;
                                        case "group":
                                            intent = new Intent(Context, typeof(GroupChatWindowActivity));
                                            intent.PutExtra("ChatId", item.LastChat.ChatId);
                                            intent.PutExtra("GroupObject", JsonConvert.SerializeObject(item.LastChat));
                                            intent.PutExtra("ShowEmpty", "no");
                                            intent.PutExtra("GroupId", item.LastChat.GroupId);
                                            break;
                                    }
                                    StartActivity(intent);
                                    break;
                                }
                            case Classes.ItemType.AddBroadcast:
                                {
                                    var intent = new Intent(Context, typeof(BroadcastActivity));
                                    StartActivity(intent);
                                    break;
                                }
                        }
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void MAdapterOnItemLongClick(object sender, GlobalClickEventArgs e)
        {
            try
            {
                var position = e.Position;
                if (position >= 0)
                {
                    var item = MAdapter.GetItem(position);
                    if (item != null)
                    {
                        switch (item.Type)
                        {
                            case Classes.ItemType.LastChatNewV:
                                {
                                    OptionsLastChatsBottomSheet bottomSheet = new OptionsLastChatsBottomSheet();
                                    Bundle bundle = new Bundle();
                                    bundle.PutString("Page", "Last");
                                    switch (item.LastChat.ChatType)
                                    {
                                        case "user":
                                            bundle.PutString("Type", "user");
                                            bundle.PutString("ItemObject", JsonConvert.SerializeObject(item.LastChat));
                                            break;
                                        case "page":
                                            bundle.PutString("Type", "page");
                                            bundle.PutString("ItemObject", JsonConvert.SerializeObject(item.LastChat));
                                            break;
                                        case "group":
                                            bundle.PutString("Type", "group");
                                            bundle.PutString("ItemObject", JsonConvert.SerializeObject(item.LastChat));
                                            break;
                                    }
                                    bottomSheet.Arguments = bundle;
                                    bottomSheet.Show(ChildFragmentManager, bottomSheet.Tag);
                                    break;
                                }
                        }
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Load Chat

        private void LoadChat()
        {
            try
            {
                var sqlEntity = new SqLiteDatabase();
                ListUtils.MuteList = sqlEntity.Get_MuteList();
                ListUtils.PinList = sqlEntity.Get_PinList();

                ListUtils.UserList = sqlEntity.Get_LastUsersChat_List();
                if (ListUtils.UserList.Count > 0) //Database.. Get Local
                {
                    LoadDataLastChatNewV(ListUtils.UserList.ToList());
                }

                if (MAdapter?.LastChatsList?.Count == 0)
                    SwipeRefreshLayout.Refreshing = true;

                StartApiService();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void StartApiService()
        {
            if (Methods.CheckConnectivity())
                PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => LoadChatAsync(true) });
            else
                ToastUtils.ShowToast(Activity, Activity.GetText(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Long);
        }

        private async Task LoadChatAsync(bool firstRun, string userOffset = "0", string groupOffset = "0", string pageOffset = "0")
        {
            if (MainScrollEvent != null && MainScrollEvent.IsLoading)
                return;

            if (Methods.CheckConnectivity())
            {
                //if (NoMoreUser && userOffset != "0" && groupOffset != "0" && pageOffset != "0")
                //    return;

                ApiRun = true;

                if (MainScrollEvent != null)
                    MainScrollEvent.IsLoading = true;

                //var countList = MAdapter?.LastChatsList?.Count ?? 0;

                var fetch = "users";

                //if (AppSettings.EnableChatGroup)
                //    fetch += ",groups";

                if (AppSettings.EnableChatPage)
                    fetch += ",pages";

                string limit = "15";
                if (firstRun)
                    limit = "30";

                int apiStatus;
                dynamic respond;

                if (userOffset != "0" && groupOffset != "0" && pageOffset != "0")
                    (apiStatus, respond) = await RequestsAsync.Message.GetChatAsync(fetch, "", userOffset, "0", pageOffset, "10", UserDetails.OnlineUsers).ConfigureAwait(false);
                else
                    (apiStatus, respond) = await RequestsAsync.Message.GetChatAsync(fetch, "", userOffset, "0", pageOffset, limit, UserDetails.OnlineUsers);

                if (apiStatus != 200 || respond is not LastChatObject result || result.Data == null)
                {
                    ApiRun = false;
                    if (MainScrollEvent != null)
                        MainScrollEvent.IsLoading = false;
                    Methods.DisplayReportResult(Activity, respond);
                }
                else
                {
                    Activity?.RunOnUiThread(() => { LoadCall(Context, result); });
                    var countList = MAdapter.LastChatsList.Count;
                    var respondList = result.Data.Count;
                    if (respondList > 0)
                    {
                        LoadDataLastChatNewV(result.Data);
                    }
                    else
                    {
                        ApiRun = false;
                        Activity?.RunOnUiThread(() =>
                        {
                            try
                            {
                                if (MAdapter?.LastChatsList?.Count > 10 && !MRecycler.CanScrollVertically(1) && !NoMoreUser)
                                {
                                    ToastUtils.ShowToast(Activity, Activity.GetText(Resource.String.Lbl_No_more_users), ToastLength.Short);
                                    NoMoreUser = true;
                                }
                                else
                                {
                                    if (MAdapter?.LastChatsList?.Count == 0)
                                        ShowEmptyPage();
                                }
                            }
                            catch (Exception e)
                            {
                                Methods.DisplayReportResultTrack(e);
                            }
                        });
                    }
                }
            }
        }

        public void LoadDataLastChatNewV(List<ChatObject> data)
        {
            try
            {
                var countList = MAdapter.LastChatsList.Count;
                var respondList = data?.Count;
                if (respondList > 0)
                {
                    Task.Run(() =>
                    {
                        try
                        {
                            bool add = false;
                            foreach (var itemChatObject in data)
                            {
                                var item = ChatTools.FilterDataLastChatNewV(itemChatObject);
                                var checkUser = MAdapter?.LastChatsList?.FirstOrDefault(a => a.LastChat?.ChatId == item.ChatId && a.LastChat?.ChatType == item.ChatType);

                                if (item.Mute?.Archive == "yes")
                                    continue;

                                int index = -1;
                                if (checkUser != null)
                                    index = MAdapter.LastChatsList.IndexOf(checkUser);

                                if (checkUser == null)
                                {
                                    add = true;

                                    if (item.Mute?.Pin == "yes")
                                    {
                                        var checkPin = MAdapter?.LastChatsList?.LastOrDefault(o => o.LastChat?.Mute?.Pin == "yes");
                                        if (checkPin != null)
                                        {
                                            var toIndex = MAdapter.LastChatsList.IndexOf(checkPin) + 1;
                                            MAdapter?.LastChatsList?.Insert(toIndex, new Classes.LastChatsClass
                                            {
                                                LastChat = item,
                                                Type = Classes.ItemType.LastChatNewV
                                            });
                                        }
                                        else
                                        {
                                            MAdapter?.LastChatsList?.Insert(0, new Classes.LastChatsClass
                                            {
                                                LastChat = item,
                                                Type = Classes.ItemType.LastChatNewV
                                            });
                                        }
                                    }
                                    else
                                    {
                                        if (countList > 0)
                                        {
                                            var checkPin = MAdapter?.LastChatsList?.LastOrDefault(o => o.LastChat?.Mute?.Pin == "yes");
                                            if (checkPin != null)
                                            {
                                                var toIndex = MAdapter.LastChatsList.IndexOf(checkPin) + 1;
                                                MAdapter?.LastChatsList?.Insert(toIndex, new Classes.LastChatsClass
                                                {
                                                    LastChat = item,
                                                    Type = Classes.ItemType.LastChatNewV
                                                });
                                            }
                                            else
                                            {
                                                MAdapter?.LastChatsList?.Insert(0, new Classes.LastChatsClass
                                                {
                                                    LastChat = item,
                                                    Type = Classes.ItemType.LastChatNewV
                                                });
                                            }
                                        }
                                        else
                                        {
                                            MAdapter?.LastChatsList?.Add(new Classes.LastChatsClass
                                            {
                                                LastChat = item,
                                                Type = Classes.ItemType.LastChatNewV
                                            });
                                        }
                                    }

                                    var instance = ChatHeadHelper.GetInstance(Context);
                                    var floatingAllow = UserDetails.ChatHead && instance.CheckPermission() && Methods.AppLifecycleObserver.AppState == "Background";
                                    if (item.LastMessage.LastMessageClass?.FromId != UserDetails.UserId && item.Mute?.Notify == "no" && floatingAllow)
                                    {
                                        var floating = new ChatHeadObject
                                        {
                                            ChatType = item.ChatType,
                                            ChatId = item.ChatId,
                                            UserId = item.UserId,
                                            PageId = item.PageId,
                                            GroupId = item.GroupId,
                                            Avatar = item.Avatar,
                                            ChatColor = "",
                                            LastSeen = item.LastseenStatus,
                                            LastSeenUnixTime = item.LastseenUnixTime,
                                            Name = item.Name,
                                            MessageCount = item.LastMessage.LastMessageClass?.MessageCount ?? "1"
                                        };

                                        switch (item.ChatType)
                                        {
                                            case "user":
                                                floating.Name = item.Name;
                                                break;
                                            case "page":
                                                var userAdminPage = item.UserId;
                                                if (userAdminPage == item.LastMessage.LastMessageClass?.ToData?.UserId)
                                                {
                                                    floating.Name = item.LastMessage.LastMessageClass?.UserData?.Name + "(" + item.PageName + ")";
                                                }
                                                else
                                                {
                                                    floating.Name = item.LastMessage.LastMessageClass?.ToData?.Name + "(" + item.PageName + ")";
                                                }
                                                break;
                                            case "group":
                                                floating.Name = item.GroupName;
                                                break;
                                        }

                                        Activity?.RunOnUiThread(() =>
                                        {
                                            instance.ShowNotification(floating);
                                        });
                                    }
                                }
                                else
                                {
                                    checkUser.LastChat.LastseenUnixTime = item.LastseenUnixTime;
                                    checkUser.LastChat.ChatTime = item.ChatTime;
                                    checkUser.LastChat.Time = item.Time;

                                    if (checkUser.LastChat.LastseenStatus?.ToLower() != item.LastseenStatus?.ToLower())
                                    {
                                        checkUser.LastChat = item;

                                        if (index > -1 && checkUser.LastChat.ChatType == item.ChatType)
                                            Activity?.RunOnUiThread(() => { MAdapter?.NotifyItemChanged(index, "WithoutBlobLastSeen"); });
                                    }

                                    if (item.LastMessage.LastMessageClass == null)
                                        return;

                                    if (checkUser.LastChat.LastMessage.LastMessageClass.Text != item.LastMessage.LastMessageClass.Text || checkUser.LastChat.LastMessage.LastMessageClass.Media != item.LastMessage.LastMessageClass.Media)
                                    {
                                        checkUser.LastChat = item;
                                        checkUser.LastChat.LastMessage = new LastMessageUnion()
                                        {
                                            LastMessageClass = item.LastMessage.LastMessageClass
                                        };

                                        if (item.Mute?.Pin == "yes")
                                        {
                                            var checkPin = MAdapter?.LastChatsList?.LastOrDefault(o => o.LastChat?.Mute?.Pin == "yes");
                                            if (checkPin != null)
                                            {
                                                var toIndex = MAdapter.LastChatsList.IndexOf(checkPin) + 1;
                                                if (index != toIndex)
                                                {
                                                    MAdapter?.LastChatsList?.Move(index, toIndex);
                                                    Activity?.RunOnUiThread(() => { MAdapter?.NotifyItemMoved(index, toIndex); });
                                                }
                                                Activity?.RunOnUiThread(() => { MAdapter?.NotifyItemChanged(toIndex, "WithoutBlobText"); });
                                            }
                                        }
                                        else
                                        {
                                            if (index > 0)
                                            {
                                                MAdapter?.LastChatsList?.Move(index, 0);

                                                Activity?.RunOnUiThread(() =>
                                                {
                                                    MAdapter?.NotifyItemMoved(index, 0);
                                                    MAdapter?.NotifyItemChanged(0, "WithoutBlobText");
                                                });
                                            }
                                            else
                                            {
                                                Activity?.RunOnUiThread(() => { MAdapter?.NotifyItemChanged(index, "WithoutBlobText"); });
                                            }
                                        }
                                    }
                                }
                            }

                            //sort by time
                            var list = MAdapter.LastChatsList.OrderByDescending(o => o.LastChat?.ChatTime).ToList();
                            MAdapter.LastChatsList = new ObservableCollection<Classes.LastChatsClass>(list);

                            if (add)
                                Activity?.RunOnUiThread(() => { MAdapter?.NotifyDataSetChanged(); });

                            Activity?.RunOnUiThread(ShowEmptyPage);
                        }
                        catch (Exception e)
                        {
                            Console.WriteLine(e);
                        }
                    });
                }
            }
            catch (Exception e)
            {
                ApiRun = false;
                Activity?.RunOnUiThread(ShowEmptyPage);
                Methods.DisplayReportResultTrack(e);
            }
        }

        //===============================================================

        public static void LoadCall(Context context, dynamic respond)
        {
            try
            {
                var videoCall = WoWonderTools.CheckAllowedCall(TypeCall.Video);
                var audioCall = WoWonderTools.CheckAllowedCall(TypeCall.Audio);

                if (respond == null || (!videoCall && !audioCall))
                    return;

                if (respond is LastChatObject chatObject)
                {
                    string typeCalling = "";
                    CallUserObject callUser = null!;
                    string title = Application.Context.GetText(Resource.String.Lbl_Voice_call);

                    switch (AppSettings.UseLibrary)
                    {
                        case SystemCall.Twilio:
                            {
                                var twilioVideoCall = chatObject.VideoCall ?? false;
                                var twilioAudioCall = chatObject.AudioCall ?? false;

                                if (twilioVideoCall && videoCall)
                                {
                                    typeCalling = "Twilio_video_call";
                                    callUser = chatObject.VideoCallUser?.CallUserClass;
                                    title = Application.Context.GetText(Resource.String.Lbl_Video_call);
                                }
                                else if (twilioAudioCall && audioCall)
                                {
                                    typeCalling = "Twilio_audio_call";
                                    callUser = chatObject.AudioCallUser?.CallUserClass;
                                    title = Application.Context.GetText(Resource.String.Lbl_Voice_call);
                                }

                                break;
                            }
                        case SystemCall.Agora:
                            {
                                var agoraCall = chatObject.AgoraCall ?? false;
                                if (agoraCall)
                                {
                                    callUser = chatObject.AgoraCallData?.CallUserClass;
                                    if (callUser != null)
                                    {
                                        if (callUser.Data.Type == "video" && videoCall)
                                        {
                                            typeCalling = "Agora_video_call_recieve";
                                            title = Application.Context.GetText(Resource.String.Lbl_Video_call);
                                        }
                                        else if (callUser.Data.Type == "audio" && audioCall)
                                        {
                                            typeCalling = "Agora_audio_call_recieve";
                                            title = Application.Context.GetText(Resource.String.Lbl_Voice_call);
                                        }
                                    }
                                }

                                break;
                            }
                    }

                    if (callUser != null && !string.IsNullOrEmpty(typeCalling))
                    {
                        var check = CallConstant.CallUserList.FirstOrDefault(a => a.Data?.Id == callUser.Data.Id);
                        if (check != null)
                            return;

                        if (CallConstant.CallActive)
                        {
                            switch (typeCalling)
                            {
                                case "Twilio_video_call":
                                    PollyController.RunRetryPolicyFunction(new List<Func<Task>> { async () => await RequestsAsync.Call.DeclineCallTwilioAsync(CallConstant.CallUserObject.Data.Id, "busy_another_call", TypeCall.Video) });
                                    ChatTabbedMainActivity.AddCallToListAndSend("busy_another_call", context.GetText(Resource.String.Lbl_Missing), TypeCall.Video, CallConstant.CallUserObject);
                                    break;
                                case "Twilio_audio_call":
                                    PollyController.RunRetryPolicyFunction(new List<Func<Task>> { async () => await RequestsAsync.Call.DeclineCallTwilioAsync(CallConstant.CallUserObject.Data.Id, "busy_another_call", TypeCall.Audio) });
                                    ChatTabbedMainActivity.AddCallToListAndSend("busy_another_call", context.GetText(Resource.String.Lbl_Missing), TypeCall.Audio, CallConstant.CallUserObject);
                                    break;
                                case "Agora_video_call_recieve":
                                    PollyController.RunRetryPolicyFunction(new List<Func<Task>> { async () => await RequestsAsync.Call.DeclineCallAgoraAsync(CallConstant.CallUserObject.Data.Id, "busy_another_call") });
                                    ChatTabbedMainActivity.AddCallToListAndSend("busy_another_call", context.GetText(Resource.String.Lbl_Missing), TypeCall.Video, CallConstant.CallUserObject);
                                    break;
                                case "Agora_audio_call_recieve":
                                    PollyController.RunRetryPolicyFunction(new List<Func<Task>> { async () => await RequestsAsync.Call.DeclineCallAgoraAsync(CallConstant.CallUserObject.Data.Id, "busy_another_call") });
                                    ChatTabbedMainActivity.AddCallToListAndSend("busy_another_call", context.GetText(Resource.String.Lbl_Missing), TypeCall.Audio, CallConstant.CallUserObject);
                                    break;
                            }
                        }
                        else
                        {
                            Intent intent = new Intent(context, typeof(CallingService));
                            intent.PutExtra("callUserObject", JsonConvert.SerializeObject(callUser));
                            intent.PutExtra("type", typeCalling);
                            intent.PutExtra("title", title);

                            intent.SetAction(CallingService.ActionStartIncoming);
                            context.StartService(intent);
                        }
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                CallConstant.CallActive = false;
            }
        }

        public void ShowEmptyPage()
        {
            try
            {
                ShimmerInflater?.Hide();

                if (AppSettings.ConnectionTypeChat == InitializeWoWonder.ConnectionType.Socket)
                {
                    if (UserDetails.Socket == null)
                    {
                        UserDetails.Socket = new WoSocketHandler();
                        UserDetails.Socket?.InitStart();
                    }

                    //Connect to socket with access token
                    if (!WoSocketHandler.IsJoined)
                        UserDetails.Socket?.Emit_Join(UserDetails.Username, UserDetails.AccessToken);
                }

                if (SwipeRefreshLayout != null && SwipeRefreshLayout.Refreshing)
                    SwipeRefreshLayout.Refreshing = false;

                if (MainScrollEvent != null)
                    MainScrollEvent.IsLoading = false;

                if (MAdapter?.LastChatsList?.Count > 0)
                {
                    var emptyStateChecker = MAdapter.LastChatsList.FirstOrDefault(a => a.Type == Classes.ItemType.EmptyPage);
                    if (emptyStateChecker != null)
                    {
                        var index = MAdapter.LastChatsList.IndexOf(emptyStateChecker);

                        MAdapter.LastChatsList.Remove(emptyStateChecker);
                        MAdapter.NotifyItemRemoved(index);
                    }

                    //add insert dbDatabase 
                    List<Classes.LastChatsClass> list = MAdapter.LastChatsList.Where(a => a.LastChat != null && a.Type == Classes.ItemType.LastChatNewV).ToList();
                    ListUtils.UserList = new ObservableCollection<ChatObject>(list.Select(lastChatsClass => lastChatsClass.LastChat).ToList());

                    SqLiteDatabase dbDatabase = new SqLiteDatabase();
                    dbDatabase.Insert_Or_Update_LastUsersChat(Context, ListUtils.UserList, UserDetails.ChatHead);
                }
                else
                {
                    var emptyStateChecker = MAdapter?.LastChatsList?.FirstOrDefault(q => q.Type == Classes.ItemType.EmptyPage);
                    if (emptyStateChecker == null)
                    {
                        MAdapter?.LastChatsList?.Add(new Classes.LastChatsClass
                        {
                            Type = Classes.ItemType.EmptyPage
                        });
                        MAdapter?.NotifyDataSetChanged();
                    }
                }
                ApiRun = false;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                ShimmerInflater?.Hide();

                if (SwipeRefreshLayout != null && SwipeRefreshLayout.Refreshing)
                    SwipeRefreshLayout.Refreshing = false;

                if (MainScrollEvent != null)
                    MainScrollEvent.IsLoading = false;
                ApiRun = false;
            }
        }

        #endregion

    }
}