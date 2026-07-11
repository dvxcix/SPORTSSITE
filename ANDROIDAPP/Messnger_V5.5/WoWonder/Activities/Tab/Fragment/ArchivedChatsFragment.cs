using Android.Content;
using Android.Graphics;
using Android.OS;
using Android.Views;
using Android.Widget;
using AndroidX.RecyclerView.Widget;
using AndroidX.SwipeRefreshLayout.Widget;
using Com.Facebook.Ads;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using WoWonder.Activities.ChatWindow;
using WoWonder.Activities.GroupChat;
using WoWonder.Activities.PageChat;
using WoWonder.Activities.Tab.Adapter;
using WoWonder.Helpers.Ads;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Model;
using WoWonder.Helpers.ShimmerUtils;
using WoWonder.Helpers.Utils;
using WoWonder.SQLite;
using WoWonderClient.Classes.Message;
using WoWonderClient.Requests;
using static WoWonder.Adapters.Holders;
using Exception = System.Exception;

namespace WoWonder.Activities.Tab.Fragment
{
    public class ArchivedChatsFragment : AndroidX.Fragment.App.Fragment
    {
        #region Variables Basic

        public LastChatsAdapter MAdapter;
        private SwipeRefreshLayout SwipeRefreshLayout;
        private RecyclerView MRecycler;
        private LinearLayoutManager LayoutManager;
        private ViewStub EmptyStateLayout, ShimmerPageLayout;
        private View Inflated, InflatedShimmer;
        private TemplateShimmerInflater ShimmerInflater;
        private AdView BannerAd;
        private bool MIsVisibleToUser;

        #endregion

        #region General

        public override View OnCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState)
        {
            try
            {
                View view = inflater.Inflate(Resource.Layout.MainFragmentLayout, container, false);
                return view;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
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

                if (IsResumed && MIsVisibleToUser)
                {
                    GetArchivedList();
                }
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
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override void OnDestroy()
        {
            try
            {
                BannerAd?.Destroy();
                base.OnDestroy();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Functions

        private void InitComponent(View view)
        {
            try
            {
                MRecycler = (RecyclerView)view.FindViewById(Resource.Id.recyler);
                EmptyStateLayout = view.FindViewById<ViewStub>(Resource.Id.viewStub);

                SwipeRefreshLayout = (SwipeRefreshLayout)view.FindViewById(Resource.Id.swipeRefreshLayout);
                SwipeRefreshLayout.SetColorSchemeResources(Android.Resource.Color.HoloBlueLight, Android.Resource.Color.HoloGreenLight, Android.Resource.Color.HoloOrangeLight, Android.Resource.Color.HoloRedLight);
                SwipeRefreshLayout.Refreshing = true;
                SwipeRefreshLayout.Enabled = true;
                SwipeRefreshLayout.SetProgressBackgroundColorSchemeColor(WoWonderTools.IsTabDark() ? Color.ParseColor("#424242") : Color.ParseColor("#f7f7f7"));
                SwipeRefreshLayout.Refresh += SwipeRefreshLayoutOnRefresh;

                LinearLayout adContainer = view.FindViewById<LinearLayout>(Resource.Id.bannerContainer);
                if (AppSettings.ShowFbBannerAds)
                    BannerAd = AdsFacebook.InitAdView(Activity, adContainer, MRecycler);
                else if (AppSettings.ShowAppLovinBannerAds)
                    AdsAppLovin.InitBannerAd(Activity, adContainer, MRecycler);
                else
                    AdsGoogle.InitBannerAdView(Activity, adContainer, MRecycler);
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
                MAdapter = new LastChatsAdapter(Activity, "Archived")
                {
                    LastChatsList = new ObservableCollection<Classes.LastChatsClass>()
                };
                MAdapter.ItemClick += MAdapterOnItemClick;
                MAdapter.ItemLongClick += MAdapterOnItemLongClick;
                LayoutManager = new LinearLayoutManager(Activity);
                MRecycler.SetLayoutManager(LayoutManager);
                MRecycler.HasFixedSize = true;
                MRecycler.SetItemViewCacheSize(10);
                MRecycler.GetLayoutManager().ItemPrefetchEnabled = true;
                MRecycler.SetAdapter(MAdapter);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Events 

        private void SwipeRefreshLayoutOnRefresh(object sender, EventArgs e)
        {
            try
            {
                if (!Methods.CheckConnectivity())
                {
                    ToastUtils.ShowToast(Activity, Activity.GetText(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);

                    if (SwipeRefreshLayout.Refreshing)
                        SwipeRefreshLayout.Refreshing = false;
                }
                else
                {
                    ShimmerInflater?.Show();

                    MAdapter?.LastChatsList?.Clear();
                    MAdapter?.NotifyDataSetChanged();

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

                                    Intent intent = null!;
                                    switch (item.LastChat.ChatType)
                                    {
                                        case "user":

                                            if (!ChatTools.ChatIsAllowed(item.LastChat))
                                                return;

                                            item.LastChat.LastMessage.LastMessageClass.ChatColor ??= AppSettings.MainColor;

                                            var mainChatColor = item.LastChat.LastMessage.LastMessageClass.ChatColor.Contains("rgb") ? Methods.FunString.ConvertColorRgBtoHex(item.LastChat.LastMessage.LastMessageClass.ChatColor) : item.LastChat.LastMessage.LastMessageClass.ChatColor ?? AppSettings.MainColor;

                                            intent = new Intent(Activity, typeof(ChatWindowActivity));
                                            intent.PutExtra("ChatId", item.LastChat.ChatId);
                                            intent.PutExtra("UserID", item.LastChat.UserId);
                                            intent.PutExtra("TypeChat", "LastMessenger");
                                            intent.PutExtra("ShowEmpty", "no");
                                            intent.PutExtra("ColorChat", mainChatColor);
                                            intent.PutExtra("UserItem", JsonConvert.SerializeObject(item.LastChat));
                                            break;
                                        case "page":
                                            intent = new Intent(Activity, typeof(PageChatWindowActivity));
                                            intent.PutExtra("ChatId", item.LastChat.ChatId);
                                            intent.PutExtra("PageId", item.LastChat.PageId);
                                            intent.PutExtra("ShowEmpty", "no");
                                            intent.PutExtra("TypeChat", "");
                                            intent.PutExtra("PageObject", JsonConvert.SerializeObject(item.LastChat));
                                            break;
                                        case "group":
                                            intent = new Intent(Activity, typeof(GroupChatWindowActivity));
                                            intent.PutExtra("ChatId", item.LastChat.ChatId);
                                            intent.PutExtra("GroupObject", JsonConvert.SerializeObject(item.LastChat));
                                            intent.PutExtra("ShowEmpty", "no");
                                            intent.PutExtra("GroupId", item.LastChat.GroupId);
                                            break;
                                    }
                                    Activity.StartActivity(intent);
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
                                    bundle.PutString("Page", "Archived");
                                    bundle.PutString("Type", item.LastChat.ChatType);
                                    bundle.PutString("ItemObject", JsonConvert.SerializeObject(item.LastChat));
                                    bottomSheet.Arguments = bundle;
                                    bottomSheet.Show(Activity.SupportFragmentManager, bottomSheet.Tag);
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

        #region Load Archived

        public void StartApiService()
        {
            if (!Methods.CheckConnectivity())
                ToastUtils.ShowToast(Activity, GetString(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);
            else
                PollyController.RunRetryPolicyFunction(new List<Func<Task>> { LoadArchived });
        }

        private async Task LoadArchived()
        {
            if (Methods.CheckConnectivity())
            {

                var fetch = "users";

                if (AppSettings.EnableChatGroup)
                    fetch += ",groups";

                if (AppSettings.EnableChatPage)
                    fetch += ",pages";

                var countList = MAdapter.LastChatsList.Count;
                var (apiStatus, respond) = await RequestsAsync.Message.GetArchivedChatsAsync(fetch);
                if (apiStatus != 200 || respond is not LastChatObject result || result.Data == null)
                {
                    Methods.DisplayReportResult(Activity, respond);
                }
                else
                {
                    var respondList = result.Data?.Count;
                    if (respondList > 0)
                    {
                        foreach (var item in from item in result.Data let check = MAdapter.LastChatsList.FirstOrDefault(a => a.LastChat?.ChatId == item.ChatId) where check == null select ChatTools.FilterDataLastChatNewV(item))
                        {
                            MAdapter.LastChatsList.Add(new Classes.LastChatsClass
                            {
                                LastChat = item,
                                Type = Classes.ItemType.LastChatNewV
                            });
                        }

                        if (countList > 0)
                        {
                            Activity?.RunOnUiThread(() => { MAdapter.NotifyItemRangeInserted(countList, MAdapter.LastChatsList.Count - countList); });
                        }
                        else
                        {
                            Activity?.RunOnUiThread(() => { MAdapter.NotifyDataSetChanged(); });
                        }
                    }
                }

                Activity?.RunOnUiThread(ShowEmptyPage);
            }
            else
            {
                Inflated = EmptyStateLayout.Inflate();
                EmptyStateInflater x = new EmptyStateInflater();
                x.InflateLayout(Inflated, EmptyStateInflater.Type.NoConnection);
                switch (x.EmptyStateButton.HasOnClickListeners)
                {
                    case false:
                        x.EmptyStateButton.Click += null!;
                        x.EmptyStateButton.Click += EmptyStateButtonOnClick;
                        break;
                }

                ToastUtils.ShowToast(Activity, GetString(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);
            }
        }

        private void ShowEmptyPage()
        {
            try
            {
                ShimmerInflater?.Hide();

                SwipeRefreshLayout.Refreshing = false;

                if (MAdapter.LastChatsList.Count > 0)
                {
                    SqLiteDatabase dbDatabase = new SqLiteDatabase();
                    dbDatabase.Insert_Or_Update_Archive(MAdapter.LastChatsList);

                    MRecycler.Visibility = ViewStates.Visible;
                    EmptyStateLayout.Visibility = ViewStates.Gone;
                    SwipeRefreshLayout.Refreshing = false;
                }
                else
                {
                    MRecycler.Visibility = ViewStates.Gone;

                    Inflated ??= EmptyStateLayout.Inflate();

                    EmptyStateInflater x = new EmptyStateInflater();
                    x.InflateLayout(Inflated, EmptyStateInflater.Type.NoArchive);
                    if (!x.EmptyStateButton.HasOnClickListeners)
                    {
                        x.EmptyStateButton.Click += null!;
                    }
                    EmptyStateLayout.Visibility = ViewStates.Visible;
                }
            }
            catch (Exception e)
            {
                ShimmerInflater?.Hide();

                SwipeRefreshLayout.Refreshing = false;
                Methods.DisplayReportResultTrack(e);
            }
        }

        //No Internet Connection 
        private void EmptyStateButtonOnClick(object sender, EventArgs e)
        {
            try
            {
                Task.Factory.StartNew(StartApiService);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        private void GetArchivedList()
        {
            try
            {
                var sqlEntity = new SqLiteDatabase();
                var list = sqlEntity.Get_Archive_List();

                if (list.Count > 0)
                {
                    MAdapter.LastChatsList = new ObservableCollection<Classes.LastChatsClass>();
                    foreach (var archive in list)
                    {
                        if (archive != null)
                        {
                            MAdapter.LastChatsList.Add(new Classes.LastChatsClass
                            {
                                LastChat = archive,
                                Type = Classes.ItemType.LastChatNewV
                            });
                        }
                    }

                    MAdapter.NotifyDataSetChanged();

                    MRecycler.Visibility = ViewStates.Visible;
                    EmptyStateLayout.Visibility = ViewStates.Gone;
                    SwipeRefreshLayout.Refreshing = false;
                }

                Task.Factory.StartNew(StartApiService);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

    }
}