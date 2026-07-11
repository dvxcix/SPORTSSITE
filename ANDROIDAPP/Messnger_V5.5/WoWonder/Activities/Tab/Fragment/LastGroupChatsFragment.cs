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
using WoWonder.Activities.GroupChat;
using WoWonder.Activities.Tab.Adapter;
using WoWonder.Frameworks.ChatHead;
using WoWonder.Helpers.Ads;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Model;
using WoWonder.Helpers.ShimmerUtils;
using WoWonder.Helpers.Utils;
using WoWonder.Library.Anjo.IntegrationRecyclerView;
using WoWonderClient.Classes.GroupChat;
using WoWonderClient.Classes.Message;
using WoWonderClient.Requests;
using static WoWonder.Adapters.Holders;

namespace WoWonder.Activities.Tab.Fragment
{
    public class LastGroupChatsFragment : AndroidX.Fragment.App.Fragment
    {
        #region Variables Basic

        public LastChatsAdapter MAdapter;
        private SwipeRefreshLayout SwipeRefreshLayout;
        private RecyclerView MRecycler;
        private LinearLayoutManager LayoutManager;
        private RecyclerViewOnScrollListener MainScrollEvent;
        private ChatTabbedMainActivity GlobalContext;
        private bool MIsVisibleToUser;

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
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override void SetMenuVisibility(bool menuVisible)
        {
            try
            {
                base.SetMenuVisibility(menuVisible);
                MIsVisibleToUser = menuVisible;
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
                if (IsResumed && MIsVisibleToUser)
                {
                    Task.Factory.StartNew(() => StartApiService());
                }
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
                SwipeRefreshLayout.Refreshing = true;
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
                MAdapter = new LastChatsAdapter(Activity, "group") { LastChatsList = new ObservableCollection<Classes.LastChatsClass>() };
                MAdapter.ItemClick += MAdapterOnItemClick;
                MAdapter.ItemLongClick += MAdapterOnItemLongClick;
                LayoutManager = new LinearLayoutManager(Activity);
                MRecycler.SetLayoutManager(LayoutManager);
                MRecycler.HasFixedSize = true;
                MRecycler.SetItemViewCacheSize(50);
                MRecycler.GetLayoutManager().ItemPrefetchEnabled = true;
                MRecycler.SetItemAnimator(null);

                var sizeProvider = new FixedPreloadSizeProvider(10, 10);
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
                //Code get last id where LoadMore >>
                var item = MAdapter.LastChatsList.LastOrDefault(a => a.Type == Classes.ItemType.LastChatNewV);
                if (item != null && !string.IsNullOrEmpty(item.LastChat.GroupId) && !MainScrollEvent.IsLoading)
                    PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => LoadGroupChatAsync(item.LastChat.GroupId) });
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
                ShimmerInflater?.Show();

                MainScrollEvent.IsLoading = false;

                MAdapter.LastChatsList.Clear();
                MAdapter.NotifyDataSetChanged();

                Task.Factory.StartNew(() => StartApiService());
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
                                    Activity?.RunOnUiThread(() =>
                                    {
                                        try
                                        {
                                            if (item.LastChat.LastMessage.LastMessageClass != null && item.LastChat.LastMessage.LastMessageClass.Seen == "0" && item.LastChat.LastMessage.LastMessageClass.ToId == UserDetails.UserId && item.LastChat.LastMessage.LastMessageClass.FromId != UserDetails.UserId)
                                            {
                                                item.LastChat.LastMessage.LastMessageClass.Seen = "1";
                                                MAdapter.NotifyItemChanged(position);
                                            }
                                        }
                                        catch (Exception exception)
                                        {
                                            Methods.DisplayReportResultTrack(exception);
                                        }
                                    });

                                    Intent intent = new Intent(Context, typeof(GroupChatWindowActivity));
                                    intent.PutExtra("ChatId", item.LastChat.ChatId);
                                    intent.PutExtra("GroupObject", JsonConvert.SerializeObject(item.LastChat));
                                    intent.PutExtra("ShowEmpty", "no");
                                    intent.PutExtra("GroupId", item.LastChat.GroupId);
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
                        OptionsLastChatsBottomSheet bottomSheet = new OptionsLastChatsBottomSheet();
                        Bundle bundle = new Bundle();
                        bundle.PutString("Type", "group");
                        bundle.PutString("ItemObject", JsonConvert.SerializeObject(item.LastChat));
                        bottomSheet.Arguments = bundle;
                        bottomSheet.Show(ChildFragmentManager, bottomSheet.Tag);
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Load Group Chat

        public void StartApiService(string offset = "0")
        {
            if (Methods.CheckConnectivity())
                PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => LoadGroupChatAsync(offset) });
            else
                ToastUtils.ShowToast(Activity, Activity.GetText(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Long);
        }

        private async Task LoadGroupChatAsync(string offset = "0")
        {
            if (MainScrollEvent.IsLoading)
                return;

            MainScrollEvent.IsLoading = true;

            var countList = MAdapter.LastChatsList.Count;
            var (apiStatus, respond) = await RequestsAsync.GroupChat.GetGroupChatListAsync("20", offset);
            if (apiStatus.Equals(200))
            {
                if (respond is GroupListObject result)
                {
                    var respondList = result.Data.Count;
                    if (respondList > 0)
                    {
                        LoadDataLastChatNewV(result.Data);
                        //foreach (var chatObject in from chatObject in result.Data let check = MAdapter?.LastChatsList.FirstOrDefault(a => a.LastChat?.GroupId == chatObject.GroupId) where check == null select chatObject)
                        //{
                        //    chatObject.ChatType = "group";
                        //    var item = ChatTools.FilterDataLastChatNewV(chatObject);

                        //    if (item.Mute?.Archive == "yes")
                        //        continue;

                        //    MAdapter?.LastChatsList.Add(new Classes.LastChatsClass
                        //    {
                        //        LastChat = item,
                        //        Type = Classes.ItemType.LastChatNewV
                        //    });
                        //}

                        //if (countList > 0)
                        //{
                        //    Activity?.RunOnUiThread(() => { MAdapter.NotifyItemRangeInserted(countList, MAdapter.LastChatsList.Count - countList); });
                        //}
                        //else
                        //{
                        //    Activity?.RunOnUiThread(() => { MAdapter.NotifyDataSetChanged(); });
                        //}
                    }
                    else
                    {
                        if (MAdapter?.LastChatsList.Count > 10 && !MRecycler.CanScrollVertically(1))
                            ToastUtils.ShowToast(Activity, Activity.GetText(Resource.String.Lbl_NoMoreGroup), ToastLength.Short);
                    }
                }
            }
            else Methods.DisplayReportResult(Activity, respond);

            Activity?.RunOnUiThread(ShowEmptyPage);
        }

        private void LoadDataLastChatNewV(List<ChatObject> data)
        {
            try
            {
                var countList = MAdapter.LastChatsList.Count;
                var respondList = data?.Count;
                if (respondList > 0)
                {
                    bool add = false;
                    foreach (var itemChatObject in data)
                    {
                        itemChatObject.ChatType = "group";
                        var item = ChatTools.FilterDataLastChatNewV(itemChatObject);
                        var checkChat = MAdapter?.LastChatsList?.FirstOrDefault(a => a.LastChat?.GroupId == item.GroupId && a.LastChat?.ChatType == item.ChatType);

                        if (item.Mute?.Archive == "yes")
                            continue;

                        int index = -1;
                        if (checkChat != null)
                            index = MAdapter.LastChatsList.IndexOf(checkChat);

                        if (checkChat == null)
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

                            if (item.LastMessage.LastMessageClass?.FromId != UserDetails.UserId && item.Mute?.Notify == "yes")
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
                                    Name = item.GroupName,
                                    MessageCount = item.LastMessage.LastMessageClass?.MessageCount ?? "1"
                                };

                                Activity?.RunOnUiThread(() =>
                                {
                                    var instance = ChatHeadHelper.GetInstance(Context);
                                    if (instance.CheckPermission() && Methods.AppLifecycleObserver.AppState == "Background")
                                        instance.ShowNotification(floating);
                                });
                            }

                        }
                        else
                        {
                            checkChat.LastChat.LastseenUnixTime = item.LastseenUnixTime;
                            checkChat.LastChat.ChatTime = item.ChatTime;
                            checkChat.LastChat.Time = item.Time;

                            if (item.LastMessage.LastMessageClass == null)
                                return;

                            if (checkChat.LastChat.LastMessage.LastMessageClass.Text != item.LastMessage.LastMessageClass.Text || checkChat.LastChat.LastMessage.LastMessageClass.Media != item.LastMessage.LastMessageClass.Media)
                            {
                                checkChat.LastChat = item;

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

                            if (checkChat.LastChat.LastseenStatus?.ToLower() != item.LastseenStatus?.ToLower())
                            {
                                checkChat.LastChat = item;

                                if (index > -1 && checkChat.LastChat.ChatType == item.ChatType)
                                    Activity?.RunOnUiThread(() => { MAdapter?.NotifyItemChanged(index, "WithoutBlobLastSeen"); });
                            }
                        }
                    }

                    if (add)
                        Activity?.RunOnUiThread(() =>
                        {
                            try
                            {
                                //sort by time
                                //var list = MAdapter.LastChatsList.OrderByDescending(o => o.LastChat?.ChatTime).ToList();
                                //MAdapter.LastChatsList = new ObservableCollection<Classes.LastChatsClass>(list);

                                MAdapter?.NotifyDataSetChanged();
                            }
                            catch (Exception e)
                            {
                                Methods.DisplayReportResultTrack(e);
                            }
                        });
                }

                Activity?.RunOnUiThread(ShowEmptyPage);
            }
            catch (Exception e)
            {
                Activity?.RunOnUiThread(ShowEmptyPage);
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void ShowEmptyPage()
        {
            try
            {
                ShimmerInflater?.Hide();

                if (SwipeRefreshLayout.Refreshing)
                    SwipeRefreshLayout.Refreshing = false;

                if (MainScrollEvent != null)
                    MainScrollEvent.IsLoading = false;

                if (MAdapter.LastChatsList.Count > 0)
                {
                    var emptyStateChecker = MAdapter.LastChatsList.FirstOrDefault(a => a.Type == Classes.ItemType.EmptyPage);
                    if (emptyStateChecker != null)
                    {
                        var index = MAdapter.LastChatsList.IndexOf(emptyStateChecker);

                        MAdapter.LastChatsList.Remove(emptyStateChecker);
                        MAdapter.NotifyItemRemoved(index);
                    }

                    //var archive = MAdapter.LastChatsList.FirstOrDefault(a => a.Type == Classes.ItemType.Archive);
                    //if (archive != null)
                    //{
                    //    archive.CountArchive = ListUtils.ArchiveUserChatList.Count.ToString();

                    //    var index = MAdapter.LastChatsList.IndexOf(archive);
                    //    MAdapter.LastChatsList.Move(index, MAdapter.LastChatsList.Count);
                    //    MAdapter.NotifyItemMoved(index, MAdapter.LastChatsList.Count);
                    //}
                    //else
                    //{
                    //    MAdapter.LastChatsList.Add(new Classes.LastChatsClass()
                    //    {
                    //        CountArchive = ListUtils.ArchiveUserChatList.Count.ToString(),
                    //        Type = Classes.ItemType.Archive, 
                    //    });
                    //    MAdapter.NotifyItemInserted(MAdapter.LastChatsList.Count);
                    //}
                }
                else
                {
                    var emptyStateChecker = MAdapter.LastChatsList.FirstOrDefault(q => q.Type == Classes.ItemType.EmptyPage);
                    if (emptyStateChecker == null)
                    {
                        MAdapter.LastChatsList.Add(new Classes.LastChatsClass
                        {
                            Type = Classes.ItemType.EmptyPage
                        });
                        MAdapter.NotifyDataSetChanged();
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                ShimmerInflater?.Hide();

                if (SwipeRefreshLayout.Refreshing)
                    SwipeRefreshLayout.Refreshing = false;

                if (MainScrollEvent != null)
                    MainScrollEvent.IsLoading = false;
            }
        }

        #endregion

    }
}