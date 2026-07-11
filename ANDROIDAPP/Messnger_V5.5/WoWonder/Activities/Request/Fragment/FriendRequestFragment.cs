using Android.Graphics;
using Android.OS;
using Android.Views;
using Android.Widget;
using AndroidX.RecyclerView.Widget;
using AndroidX.SwipeRefreshLayout.Widget;
using Bumptech.Glide.Util;
using Com.Facebook.Ads;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using WoWonder.Activities.Request.Adapter;
using WoWonder.Helpers.Ads;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.ShimmerUtils;
using WoWonder.Helpers.Utils;
using WoWonder.Library.Anjo.IntegrationRecyclerView;
using WoWonderClient.Classes.Funding;
using WoWonderClient.Classes.Global;
using WoWonderClient.Requests;

namespace WoWonder.Activities.Request.Fragment
{
    public class FriendRequestFragment : AndroidX.Fragment.App.Fragment
    {
        #region Variables Basic

        public FriendRequestsAdapter MAdapter;
        private RequestActivity ContextRequest;
        private SwipeRefreshLayout SwipeRefreshLayout;
        private RecyclerView MRecycler;
        private LinearLayoutManager LayoutManager;
        private ViewStub EmptyStateLayout, ShimmerPageLayout;
        private View Inflated, InflatedShimmer;
        private TemplateShimmerInflater ShimmerInflater;
        private AdView BannerAd;

        #endregion

        #region General

        public override View OnCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState)
        {
            try
            {
                View view = inflater.Inflate(Resource.Layout.MainFragmentLayout, container, false);
                ContextRequest = (RequestActivity)Activity;
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
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
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
                SwipeRefreshLayout.Click += SwipeRefreshLayoutOnClick;

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
                LayoutManager = new LinearLayoutManager(Activity);
                MAdapter = new FriendRequestsAdapter(Activity)
                {
                    UserList = new ObservableCollection<UserDataObject>()
                };
                MAdapter.AddButtonItemClick += MAdapterOnAddButtonItemClick;
                MAdapter.DeleteButtonItemClick += MAdapterOnDeleteButtonItemClick;
                MRecycler.SetLayoutManager(LayoutManager);
                MRecycler.HasFixedSize = true;
                MRecycler.SetItemViewCacheSize(10);
                MRecycler.GetLayoutManager().ItemPrefetchEnabled = true;
                var sizeProvider = new FixedPreloadSizeProvider(10, 10);
                var preLoader = new RecyclerViewPreloader<FundingDataObject>(Activity, MAdapter, sizeProvider, 10);
                MRecycler.AddOnScrollListener(preLoader);
                MRecycler.SetAdapter(MAdapter);

            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Events

        private void SwipeRefreshLayoutOnClick(object sender, EventArgs e)
        {
            try
            {
                ShimmerInflater?.Show();

                MAdapter.UserList.Clear();
                MAdapter.NotifyDataSetChanged();

                ContextRequest.StartApiService();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void MAdapterOnAddButtonItemClick(object sender, FriendRequestsAdapterClickEventArgs e)
        {
            try
            {
                if (e.Position > -1)
                {
                    var item = MAdapter.GetItem(e.Position);
                    if (item != null)
                    {
                        if (Methods.CheckConnectivity())
                        {
                            PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => RequestsAsync.Global.FollowRequestActionAsync(item.UserId, true) }); // true >> Accept 

                            ListUtils.FriendRequestsList?.RemoveAt(e.Position);

                            MAdapter.UserList.Remove(item);
                            MAdapter.NotifyDataSetChanged();

                            ShowEmptyPage();
                        }
                        else
                        {
                            ToastUtils.ShowToast(Activity, GetString(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);
                        }
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void MAdapterOnDeleteButtonItemClick(object sender, FriendRequestsAdapterClickEventArgs e)
        {
            try
            {
                if (e.Position > -1)
                {
                    var item = MAdapter.GetItem(e.Position);
                    if (item != null)
                    {
                        if (Methods.CheckConnectivity())
                        {
                            PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => RequestsAsync.Global.FollowRequestActionAsync(item.UserId, false) }); // false >> Decline

                            ListUtils.FriendRequestsList?.RemoveAt(e.Position);

                            MAdapter.UserList.Remove(item);
                            MAdapter.NotifyDataSetChanged();

                            ShowEmptyPage();
                        }
                        else
                        {
                            ToastUtils.ShowToast(Activity, GetString(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);
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

        public void ShowEmptyPage()
        {
            try
            {
                ShimmerInflater?.Hide();

                SwipeRefreshLayout.Refreshing = false;
                if (MAdapter.UserList.Count > 0)
                {
                    MRecycler.Visibility = ViewStates.Visible;
                    EmptyStateLayout.Visibility = ViewStates.Gone;
                }
                else
                {
                    MRecycler.Visibility = ViewStates.Gone;

                    Inflated ??= EmptyStateLayout.Inflate();

                    EmptyStateInflater x = new EmptyStateInflater();
                    x.InflateLayout(Inflated, EmptyStateInflater.Type.NoUsers);
                    if (!x.EmptyStateButton.HasOnClickListeners)
                        x.EmptyStateButton.Click += null!;

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

    }
}