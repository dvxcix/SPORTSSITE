using Android.App;
using Android.Content.PM;
using Android.Graphics;
using Android.OS;
using Android.Views;
using Android.Widget;
using AndroidHUD;
using AndroidX.AppCompat.Content.Res;
using AndroidX.AppCompat.Widget;
using AndroidX.RecyclerView.Widget;
using Bumptech.Glide;
using Bumptech.Glide.Request;
using Bumptech.Glide.Util;
using Com.Aghajari.Emojiview.View;
using Google.Android.Material.Dialog;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using WoWonder.Activities.Base;
using WoWonder.Activities.GroupChat;
using WoWonder.Activities.GroupChat.Adapter;
using WoWonder.Activities.StickersView;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Utils;
using WoWonder.Library.Anjo.IntegrationRecyclerView;
using WoWonderClient.Classes.Broadcast;
using WoWonderClient.Classes.Global;
using WoWonderClient.Requests;
using Intent = Android.Content.Intent;
using Toolbar = AndroidX.AppCompat.Widget.Toolbar;

namespace WoWonder.Activities.Broadcast
{
    [Activity(Icon = "@mipmap/icon", Theme = "@style/MyTheme", ConfigurationChanges = ConfigChanges.Locale | ConfigChanges.UiMode | ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize)]
    public class CreateBroadcastActivity : BaseActivity
    {
        #region Variables Basic

        private AXEmojiEditText TxtBroadcastName;
        private ImageView ChatEmojImage;
        private FrameLayout BtnImage;
        private ImageView ImageBroadcast;
        private AppCompatButton BtnDeleteBroadcast, BtnCreateBroadcast;
        private GroupMembersAdapter MAdapter;
        private RecyclerView MRecycler;
        private LinearLayoutManager LayoutManager;

        private string BroadcastPathImage = "", UsersIds;
        private List<UserDataObject> UserList;

        private int Position;
        private BroadcastActivity GlobalContext;

        #endregion

        #region General

        protected override void OnCreate(Bundle savedInstanceState)
        {
            try
            {
                base.OnCreate(savedInstanceState);
                SetTheme(WoWonderTools.IsTabDark() ? Resource.Style.MyTheme_Dark : Resource.Style.MyTheme);
                Methods.App.FullScreenApp(this);

                // Create your application here
                SetContentView(Resource.Layout.CreateBroadcastLayout);

                GlobalContext = BroadcastActivity.GetInstance();

                //Get Value And Set Toolbar
                InitComponent();
                InitToolbar();
                SetRecyclerViewAdapters();
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
                base.OnPause();
                AddOrRemoveEvent(false);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Functions

        private void InitComponent()
        {
            try
            {
                MRecycler = (RecyclerView)FindViewById(Resource.Id.userRecyler);
                TxtBroadcastName = FindViewById<AXEmojiEditText>(Resource.Id.BroadcastName);
                ImageBroadcast = FindViewById<ImageView>(Resource.Id.BroadcastCover);
                BtnImage = FindViewById<FrameLayout>(Resource.Id.btn_selectimage);

                ChatEmojImage = FindViewById<ImageView>(Resource.Id.emojiicon);

                BtnCreateBroadcast = FindViewById<AppCompatButton>(Resource.Id.createBroadcastButton);

                BtnDeleteBroadcast = FindViewById<AppCompatButton>(Resource.Id.deleteBroadcastButton);
                BtnDeleteBroadcast.Visibility = ViewStates.Gone;

                Methods.SetColorEditText(TxtBroadcastName, WoWonderTools.IsTabDark() ? Color.White : Color.Black);

                InitEmojisView();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void InitToolbar()
        {
            try
            {
                var toolbar = FindViewById<Toolbar>(Resource.Id.toolbar);
                if (toolbar != null)
                {
                    toolbar.Title = GetString(Resource.String.Lbl_CreateBroadcast);
                    toolbar.SetTitleTextColor(WoWonderTools.IsTabDark() ? Color.White : Color.Black);
                    SetSupportActionBar(toolbar);
                    SupportActionBar.SetDisplayShowCustomEnabled(true);
                    SupportActionBar.SetDisplayHomeAsUpEnabled(true);
                    SupportActionBar.SetHomeButtonEnabled(true);
                    SupportActionBar.SetDisplayShowHomeEnabled(true);

                    var icon = AppCompatResources.GetDrawable(this, AppSettings.FlowDirectionRightToLeft ? Resource.Drawable.icon_back_arrow_right : Resource.Drawable.icon_back_arrow_left);
                    icon?.SetTint(WoWonderTools.IsTabDark() ? Color.White : Color.ParseColor("#060606"));
                    SupportActionBar.SetHomeAsUpIndicator(icon);
                }
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
                MAdapter = new GroupMembersAdapter(this, true)
                {
                    UserList = new ObservableCollection<UserDataObject>(),
                };
                LayoutManager = new LinearLayoutManager(this);
                MRecycler.SetLayoutManager(LayoutManager);
                MRecycler.HasFixedSize = true;
                MRecycler.SetItemViewCacheSize(10);
                MRecycler.GetLayoutManager().ItemPrefetchEnabled = true;
                var sizeProvider = new FixedPreloadSizeProvider(10, 10);
                var preLoader = new RecyclerViewPreloader<UserDataObject>(this, MAdapter, sizeProvider, 10);
                MRecycler.AddOnScrollListener(preLoader);
                MRecycler.SetAdapter(MAdapter);

                MRecycler.Visibility = ViewStates.Visible;

                // Add first image Default  
                MAdapter.UserList.Add(new UserDataObject
                {
                    UserId = "0",
                    Avatar = "addImage",
                    Name = GetString(Resource.String.Lbl_AddRecipients),
                    About = GetString(Resource.String.Lbl_Group_Add_Description),
                });
                MAdapter.NotifyDataSetChanged();
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
                    BtnCreateBroadcast.Click += TxtAddOnClick;
                    BtnImage.Click += BtnImageOnClick;
                    MAdapter.ItemClick += MAdapterOnItemClick;
                    MAdapter.MoreItemClick += MAdapterOnItemLongClick;
                }
                else
                {
                    BtnCreateBroadcast.Click -= TxtAddOnClick;
                    BtnImage.Click -= BtnImageOnClick;
                    MAdapter.ItemClick -= MAdapterOnItemClick;
                    MAdapter.MoreItemClick -= MAdapterOnItemLongClick;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void InitEmojisView()
        {
            Task.Factory.StartNew(() =>
            {
                try
                {
                    if (WoWonderTools.IsTabDark())
                        EmojisViewTools.LoadDarkTheme();
                    else
                        EmojisViewTools.LoadTheme(AppSettings.MainColor);

                    EmojisViewTools.MStickerView = false;
                    EmojisViewTools.LoadView(this, TxtBroadcastName, "", ChatEmojImage);
                }
                catch (Exception e)
                {
                    Methods.DisplayReportResultTrack(e);
                }
            });
        }

        #endregion

        #region Events

        private void MAdapterOnItemLongClick(object sender, GroupMembersAdapterClickEventArgs e)
        {
            try
            {
                var position = e.Position;
                if (position >= 0)
                {
                    var item = MAdapter.GetItem(position);
                    if (item == null) return;
                    if (item.Avatar == "addImage") return;

                    Position = e.Position;
                    var dialog = new MaterialAlertDialogBuilder(this);
                    dialog.SetTitle(GetString(Resource.String.Lbl_Remove) + " " + WoWonderTools.GetNameFinal(item));
                    dialog.SetPositiveButton(GetText(Resource.String.Lbl_Yes), (o, args) =>
                    {
                        try
                        {
                            if (Methods.CheckConnectivity())
                            {
                                var itemUser = MAdapter.GetItem(Position);
                                if (itemUser != null)
                                {
                                    MAdapter.UserList.Remove(itemUser);
                                    MAdapter.NotifyItemRemoved(Position);
                                }
                            }
                            else
                            {
                                ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);
                            }
                        }
                        catch (Exception exception)
                        {
                            Console.WriteLine(exception);
                        }
                    });
                    dialog.SetNegativeButton(GetText(Resource.String.Lbl_No), new MaterialDialogUtils());

                    dialog.Show();
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void MAdapterOnItemClick(object sender, GroupMembersAdapterClickEventArgs adapterClickEvents)
        {
            try
            {
                var position = adapterClickEvents.Position;
                if (position >= 0)
                {
                    var item = MAdapter.GetItem(position);
                    if (item == null) return;
                    if (item.Avatar != "addImage") return;
                    StartActivityForResult(new Intent(this, typeof(MentionActivity)), 3);
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void BtnImageOnClick(object sender, EventArgs e)
        {
            try
            {
                PixImagePickerUtils.OpenDialogGallery(this);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private async void TxtAddOnClick(object sender, EventArgs e)
        {
            try
            {
                if (!Methods.CheckConnectivity())
                {
                    ToastUtils.ShowToast(this, GetString(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);
                }
                else
                {
                    if (string.IsNullOrEmpty(TxtBroadcastName.Text) || string.IsNullOrWhiteSpace(TxtBroadcastName.Text))
                    {
                        ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_Please_enter_name), ToastLength.Short);
                        return;
                    }

                    if (TxtBroadcastName.Text.Length < 4 && TxtBroadcastName.Text.Length > 15)
                    {
                        ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_ErrorLengthBroadcastName), ToastLength.Short);
                        return;
                    }

                    if (string.IsNullOrEmpty(BroadcastPathImage))
                    {
                        ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_Please_select_Image), ToastLength.Short);
                        return;
                    }

                    var list = MAdapter.UserList.Where(a => a.Avatar != "addImage").ToList();
                    if (list.Count < 2)
                    {
                        ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_limit_recipients), ToastLength.Long);
                        return;
                    }

                    //Show a progress
                    AndHUD.Shared.Show(this, GetText(Resource.String.Lbl_Loading));

                    UsersIds = "";
                    foreach (var user in list)
                    {
                        UsersIds += user.UserId + ",";
                    }

                    UsersIds = UsersIds.Remove(UsersIds.Length - 1, 1);

                    var (apiStatus, respond) = await RequestsAsync.Broadcast.CreateBroadcastAsync(TxtBroadcastName.Text, UsersIds, BroadcastPathImage);
                    if (apiStatus == 200)
                    {
                        if (respond is CreateBroadcastObject result)
                        {
                            AndHUD.Shared.ShowSuccess(this);

                            //Add new item to my Broadcast list 
                            var adapter = GlobalContext?.MAdapter;
                            if (result.Data != null && adapter != null)
                            {

                                adapter.BroadcastList.Insert(0, result.Data);
                                adapter.NotifyDataSetChanged();

                                GlobalContext.ShowEmptyPage();

                                var intent = new Intent(this, typeof(BroadcastChatWindowActivity));
                                intent.PutExtra("BroadcastObject", JsonConvert.SerializeObject(result.Data));
                                StartActivity(intent);
                            }

                            Finish();
                        }
                    }
                    else
                    {
                        Methods.DisplayAndHudErrorResult(this, respond);
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
                AndHUD.Shared.Dismiss();
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
                            BroadcastPathImage = filepath;
                            Glide.With(this).Load(filepath).Apply(new RequestOptions().CircleCrop()).Into(ImageBroadcast);
                        }
                        else
                        {
                            ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_Failed_to_load), ToastLength.Short);
                        }
                    }
                }
                else if (requestCode == 3 && resultCode == Result.Ok)
                {
                    UserList = MentionActivity.MAdapter.MentionList.Where(a => a.Selected).ToList();

                    UsersIds = "";
                    foreach (var user in UserList)
                    {
                        UsersIds += user.UserId + ",";

                        var dataUser = MAdapter.UserList.FirstOrDefault(attachments => attachments.UserId == user.UserId);
                        if (dataUser == null)
                        {
                            MAdapter.UserList.Insert(1, user);
                        }
                    }
                    UsersIds = UsersIds.Remove(UsersIds.Length - 1, 1);

                    MAdapter.NotifyDataSetChanged();
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
                base.OnRequestPermissionsResult(requestCode, permissions, grantResults);

                if (requestCode == 108)
                {
                    if (grantResults.Length > 0 && grantResults[0] == Permission.Granted)
                    {
                        PixImagePickerUtils.OpenDialogGallery(this);
                    }
                    else
                    {
                        ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_Permission_is_denied), ToastLength.Long);
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

    }
}