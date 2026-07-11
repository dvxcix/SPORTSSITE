using Android;
using Android.Content;
using Android.Content.PM;
using Android.Graphics;
using Android.OS;
using Android.Views;
using Android.Widget;
using AndroidX.RecyclerView.Widget;
using AndroidX.SwipeRefreshLayout.Widget;
using Com.Facebook.Ads;
using Google.Android.Material.Dialog;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using WoWonder.Activities.Call.Tools;
using WoWonder.Activities.Tab.Adapter;
using WoWonder.Helpers.Ads;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Model;
using WoWonder.Helpers.ShimmerUtils;
using WoWonder.Helpers.Utils;
using WoWonder.SQLite;
using WoWonderClient.Classes.Call;
using WoWonderClient.Classes.Message;
using Exception = System.Exception;

namespace WoWonder.Activities.Tab.Fragment
{
    public class LastCallsFragment : AndroidX.Fragment.App.Fragment, IDialogListCallBack
    {
        #region Variables Basic

        public LastCallsAdapter MAdapter;
        private SwipeRefreshLayout SwipeRefreshLayout;
        public RecyclerView MRecycler;
        private LinearLayoutManager LayoutManager;
        private ViewStub EmptyStateLayout, ShimmerPageLayout;
        private View Inflated, InflatedShimmer;
        private TemplateShimmerInflater ShimmerInflater;
        public Classes.CallUser DataUser;
        private AdView BannerAd;
        public string TypeCallSelected = "";
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

        public override void OnResume()
        {
            try
            {
                Get_CallUser();
                base.OnResume();
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
                SwipeRefreshLayout.Refreshing = false;
                SwipeRefreshLayout.Enabled = false;
                SwipeRefreshLayout.SetProgressBackgroundColorSchemeColor(WoWonderTools.IsTabDark() ? Color.ParseColor("#424242") : Color.ParseColor("#f7f7f7"));

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
                MAdapter = new LastCallsAdapter(Activity) { MCallUser = new ObservableCollection<Classes.CallUser>() };
                MAdapter.CallClick += MAdapterOnCallClick;
                LayoutManager = new LinearLayoutManager(Activity);
                MRecycler.SetLayoutManager(LayoutManager);
                MRecycler.SetAdapter(MAdapter);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Events 

        private void MAdapterOnCallClick(object sender, LastCallsAdapterClickEventArgs adapterClickEvents)
        {
            try
            {
                var position = adapterClickEvents.Position;
                if (position >= 0)
                {
                    var item = MAdapter.GetItem(position);
                    if (item != null)
                    {
                        DataUser = item;

                        var videoCall = WoWonderTools.CheckAllowedCall(TypeCall.Video);
                        var audioCall = WoWonderTools.CheckAllowedCall(TypeCall.Audio);

                        if (videoCall && audioCall)
                        {
                            var arrayAdapter = new List<string>();
                            var dialogList = new MaterialAlertDialogBuilder(Context);

                            arrayAdapter.Add(Context.GetText(Resource.String.Lbl_Voice_call));
                            arrayAdapter.Add(Context.GetText(Resource.String.Lbl_Video_call));

                            dialogList.SetTitle(GetText(Resource.String.Lbl_Call));
                            //dialogList.SetMessage(GetText(Resource.String.Lbl_Select_Type_Call));
                            dialogList.SetItems(arrayAdapter.ToArray(), new MaterialDialogUtils(arrayAdapter, this));
                            dialogList.SetNegativeButton(GetText(Resource.String.Lbl_Close), new MaterialDialogUtils());

                            dialogList.Show();
                        }
                        else if (audioCall == false && videoCall)  // Video Call On
                        {
                            if ((int)Build.VERSION.SdkInt >= 23)
                            {
                                if (Activity.CheckSelfPermission(Manifest.Permission.Camera) == Permission.Granted && Activity.CheckSelfPermission(Manifest.Permission.RecordAudio) == Permission.Granted && Activity.CheckSelfPermission(Manifest.Permission.ModifyAudioSettings) == Permission.Granted)
                                {
                                    StartCall(TypeCall.Video, item);
                                }
                                else
                                {
                                    new PermissionsController(Activity).RequestPermission(103);
                                }
                            }
                            else
                            {
                                StartCall(TypeCall.Video, item);
                            }
                        }
                        else if (audioCall && !videoCall) // // Audio Call On
                        {
                            if ((int)Build.VERSION.SdkInt >= 23)
                            {
                                if (Activity.CheckSelfPermission(Manifest.Permission.RecordAudio) == Permission.Granted && Activity.CheckSelfPermission(Manifest.Permission.ModifyAudioSettings) == Permission.Granted)
                                {
                                    StartCall(TypeCall.Audio, item);
                                }
                                else
                                {
                                    new PermissionsController(Activity).RequestPermission(102);
                                }
                            }
                            else
                            {
                                StartCall(TypeCall.Audio, item);
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

        #endregion

        #region Load Call

        private void Get_CallUser()
        {
            try
            {
                var dbDatabase = new SqLiteDatabase();
                var localList = dbDatabase.Get_CallUserList();
                if (localList?.Count > 0)
                {
                    localList.Reverse();
                    MAdapter.MCallUser = new ObservableCollection<Classes.CallUser>(localList);
                    MAdapter.NotifyDataSetChanged();
                }

                ShowEmptyPage();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void ShowEmptyPage()
        {
            try
            {
                ShimmerInflater?.Hide();

                if (MAdapter.MCallUser.Count > 0)
                {
                    MRecycler.Visibility = ViewStates.Visible;
                    EmptyStateLayout.Visibility = ViewStates.Gone;
                }
                else
                {
                    MRecycler.Visibility = ViewStates.Gone;

                    Inflated ??= EmptyStateLayout.Inflate();

                    EmptyStateInflater x = new EmptyStateInflater();
                    x.InflateLayout(Inflated, EmptyStateInflater.Type.NoCall);
                    if (!x.EmptyStateButton.HasOnClickListeners)
                    {
                        x.EmptyStateButton.Click += null!;
                    }
                    EmptyStateLayout.Visibility = ViewStates.Visible;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region MaterialDialog

        public void OnSelection(IDialogInterface dialog, int position, string itemString)
        {
            try
            {
                if (itemString == Context.GetText(Resource.String.Lbl_Voice_call))
                {
                    TypeCallSelected = "Audio";
                    if ((int)Build.VERSION.SdkInt >= 23)
                    {
                        if (Activity.CheckSelfPermission(Manifest.Permission.Camera) == Permission.Granted && Activity.CheckSelfPermission(Manifest.Permission.RecordAudio) == Permission.Granted && Activity.CheckSelfPermission(Manifest.Permission.ModifyAudioSettings) == Permission.Granted)
                        {
                            StartCall(TypeCall.Audio, DataUser);
                        }
                        else
                        {
                            new PermissionsController(Activity).RequestPermission(103);
                        }
                    }
                    else
                    {
                        StartCall(TypeCall.Audio, DataUser);
                    }
                }
                else if (itemString == Context.GetText(Resource.String.Lbl_Video_call))
                {
                    TypeCallSelected = "Video";
                    if ((int)Build.VERSION.SdkInt >= 23)
                    {
                        if (Activity.CheckSelfPermission(Manifest.Permission.Camera) == Permission.Granted && Activity.CheckSelfPermission(Manifest.Permission.RecordAudio) == Permission.Granted && Activity.CheckSelfPermission(Manifest.Permission.ModifyAudioSettings) == Permission.Granted)
                        {
                            StartCall(TypeCall.Video, DataUser);
                        }
                        else
                        {
                            new PermissionsController(Activity).RequestPermission(103);
                        }
                    }
                    else
                    {
                        StartCall(TypeCall.Video, DataUser);
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Call

        public void StartCall(TypeCall type, Classes.CallUser dataUser)
        {
            try
            {
                Intent intentCall = new Intent(Context, typeof(CallingService));
                if (type == TypeCall.Audio)
                {
                    switch (AppSettings.UseLibrary)
                    {
                        case SystemCall.Agora:
                            intentCall.PutExtra("type", "Agora_audio_calling_start");
                            break;
                        case SystemCall.Twilio:
                            intentCall.PutExtra("type", "Twilio_audio_calling_start");
                            break;
                    }
                }
                else if (type == TypeCall.Video)
                {
                    switch (AppSettings.UseLibrary)
                    {
                        case SystemCall.Agora:
                            intentCall.PutExtra("type", "Agora_video_calling_start");
                            break;
                        case SystemCall.Twilio:
                            intentCall.PutExtra("type", "Twilio_video_calling_start");
                            break;
                    }
                }

                if (dataUser != null)
                {
                    var callUserObject = new CallUserObject
                    {
                        UserId = dataUser.UserId,
                        Avatar = dataUser.Avatar,
                        Name = dataUser.Name,
                        Data = new CallUserObject.DataCallUser()
                    };
                    intentCall?.PutExtra("callUserObject", JsonConvert.SerializeObject(callUserObject));
                }

                intentCall.SetAction(CallingService.ActionStartNewCall);
                Context.StartService(intentCall);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

    }
}