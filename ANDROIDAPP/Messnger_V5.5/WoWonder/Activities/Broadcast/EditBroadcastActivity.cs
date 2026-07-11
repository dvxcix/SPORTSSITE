using Android.App;
using Android.Content;
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
using WoWonder.Helpers.CacheLoaders;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Model;
using WoWonder.Helpers.Utils;
using WoWonder.Library.Anjo.IntegrationRecyclerView;
using WoWonder.SQLite;
using WoWonderClient.Classes.Broadcast;
using WoWonderClient.Classes.Global;
using WoWonderClient.Requests;
using Console = System.Console;
using Exception = System.Exception;
using Toolbar = AndroidX.AppCompat.Widget.Toolbar;

namespace WoWonder.Activities.Broadcast
{
    [Activity(Icon = "@mipmap/icon", Theme = "@style/MyTheme", ConfigurationChanges = ConfigChanges.Locale | ConfigChanges.UiMode | ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize)]
    public class EditBroadcastActivity : BaseActivity
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

        private string TypePage, BroadcastPathImage = "", UsersIds, RemovedUsersIds, BroadcastId;
        private List<UserDataObject> NewUserList, RemovedUserList;

        private BroadcastDataObject BroadcastData;
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

                TypePage = Intent?.GetStringExtra("Type") ?? "";
                string obj = Intent?.GetStringExtra("BroadcastObject") ?? "";
                if (!string.IsNullOrEmpty(obj))
                {
                    BroadcastData = JsonConvert.DeserializeObject<BroadcastDataObject>(obj);
                    BroadcastId = BroadcastData.Id;
                }

                GlobalContext = BroadcastActivity.GetInstance();

                //Get Value And Set Toolbar
                InitComponent();
                InitToolbar();
                SetRecyclerViewAdapters();

                LoadContacts();
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

                if (TypePage == "Profile")
                {
                    ChatEmojImage.Visibility = ViewStates.Invisible;
                    BtnDeleteBroadcast.Visibility = ViewStates.Gone;
                    BtnCreateBroadcast.Visibility = ViewStates.Gone;
                    BtnImage.Visibility = ViewStates.Gone;

                    Methods.SetFocusable(TxtBroadcastName);
                }
                else
                {
                    BtnDeleteBroadcast.Visibility = ViewStates.Visible;
                }
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
                    toolbar.Title = GetString(Resource.String.Lbl_EditBroadcast);
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
                MAdapter = new GroupMembersAdapter(this, TypePage == "Edit")
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

                if (TypePage == "Edit")
                {
                    // Add first image Default  
                    MAdapter.UserList.Add(new UserDataObject
                    {
                        UserId = "0",
                        Avatar = "addImage",
                        Name = GetString(Resource.String.Lbl_AddRecipients),
                        About = GetString(Resource.String.Lbl_Group_Add_Description)
                    });
                    MAdapter.NotifyDataSetChanged();
                }
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

                    if (TypePage == "Edit")
                        BtnImage.Click += BtnImageOnClick;

                    MAdapter.ItemClick += MAdapterOnItemClick;
                    BtnDeleteBroadcast.Click += BtnDeleteBroadcastOnClick;
                    MAdapter.MoreItemClick += MAdapterOnItemLongClick;
                }
                else
                {
                    BtnCreateBroadcast.Click -= TxtAddOnClick;

                    if (TypePage == "Edit")
                        BtnImage.Click -= BtnImageOnClick;

                    MAdapter.ItemClick -= MAdapterOnItemClick;
                    BtnDeleteBroadcast.Click -= BtnDeleteBroadcastOnClick;
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

        //Edit Broadcast
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

                    if (BroadcastPathImage == BroadcastData.Image)
                    {
                        BroadcastPathImage = "";
                    }

                    //Show a progress
                    AndHUD.Shared.Show(this, GetText(Resource.String.Lbl_Loading));

                    var list = MAdapter.UserList.Where(a => a.Avatar != "addImage").ToList();
                    if (list.Count < 2)
                    {
                        ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_limit_recipients), ToastLength.Long);
                        return;
                    }

                    //add user
                    UsersIds = "";
                    foreach (var user in list)
                    {
                        UsersIds += user.UserId + ",";
                    }

                    UsersIds = UsersIds.Remove(UsersIds.Length - 1, 1);

                    //Remove user
                    RemovedUsersIds = "";
                    foreach (var user in RemovedUserList)
                    {
                        RemovedUsersIds += user.UserId + ",";
                    }

                    RemovedUsersIds = RemovedUsersIds.Remove(RemovedUsersIds.Length - 1, 1);

                    var (apiStatus, respond) = await RequestsAsync.Broadcast.EditBroadcastAsync(BroadcastId, TxtBroadcastName.Text, BroadcastPathImage, UsersIds, RemovedUsersIds);
                    if (apiStatus == 200)
                    {
                        if (respond is CreateBroadcastObject result)
                        {
                            AndHUD.Shared.ShowSuccess(this);

                            //Add new item to my Broadcast list
                            if (result.Data != null)
                            {
                                var adapter = GlobalContext?.MAdapter;
                                var data = adapter?.BroadcastList.FirstOrDefault(a => a.Id == BroadcastData.Id);
                                if (data != null)
                                {
                                    var index = adapter.BroadcastList.IndexOf(data);
                                    if (index > -1)
                                    {
                                        BroadcastData = result.Data;
                                        adapter.BroadcastList[index] = result.Data;

                                        adapter.NotifyDataSetChanged();
                                    }
                                }
                            }

                            var resultIntent = new Intent();
                            resultIntent.PutExtra("BroadcastName", TxtBroadcastName.Text);
                            SetResult(Result.Ok, resultIntent);

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

        //delete Broadcast chat
        private void BtnDeleteBroadcastOnClick(object sender, EventArgs e)
        {
            try
            {
                if (!Methods.CheckConnectivity())
                {
                    ToastUtils.ShowToast(this, GetString(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);
                }
                else
                {
                    var dialog = new MaterialAlertDialogBuilder(this);
                    dialog.SetMessage(GetText(Resource.String.Lbl_AreYouSureDeleteBroadcast));
                    dialog.SetPositiveButton(GetText(Resource.String.Lbl_DeleteBroadcast), async (o, args) =>
                    {
                        try
                        {
                            //Show a progress
                            AndHUD.Shared.Show(this, GetText(Resource.String.Lbl_Loading));

                            var (apiStatus, respond) = await RequestsAsync.Broadcast.DeleteBroadcastAsync(BroadcastId);
                            if (apiStatus == 200)
                            {
                                AndHUD.Shared.ShowSuccess(this);
                                if (respond is MessageObject result)
                                {
                                    Console.WriteLine(result.Message);
                                    ToastUtils.ShowToast(this, GetString(Resource.String.Lbl_BroadcastSuccessfullyDeleted), ToastLength.Short);

                                    //remove item to my Broadcast list  
                                    var adapter = GlobalContext?.MAdapter;
                                    var data = adapter?.BroadcastList?.FirstOrDefault(a => a.Id == BroadcastId);
                                    if (data != null)
                                    {
                                        adapter.BroadcastList.Remove(data);
                                        adapter.NotifyItemRemoved(adapter.BroadcastList.IndexOf(data));
                                    }

                                    var dbDatabase = new SqLiteDatabase();
                                    dbDatabase.DeleteAllBroadcastMessagesUser(UserDetails.UserId, BroadcastId);

                                    var broadcastChatInstance = BroadcastChatWindowActivity.GetInstance();
                                    broadcastChatInstance?.Finish();

                                    Finish();
                                }
                            }
                            else
                            {
                                Methods.DisplayAndHudErrorResult(this, respond);
                            }
                        }
                        catch (Exception exception)
                        {
                            Methods.DisplayReportResultTrack(exception);
                        }
                    });
                    dialog.SetNegativeButton(GetText(Resource.String.Lbl_Cancel), new MaterialDialogUtils());

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
                            var itemUser = MAdapter.GetItem(Position);
                            if (itemUser != null)
                            {
                                RemovedUserList ??= new List<UserDataObject>();
                                RemovedUserList.Add(itemUser);

                                MAdapter.UserList.Remove(itemUser);
                                MAdapter.NotifyItemRemoved(Position);
                            }
                        }
                        catch (Exception exception)
                        {
                            Methods.DisplayReportResultTrack(exception);
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
                    NewUserList ??= new List<UserDataObject>();
                    NewUserList = MentionActivity.MAdapter.MentionList.Where(a => a.Selected).ToList();

                    foreach (var user in NewUserList)
                    {
                        var dataUser = MAdapter.UserList.FirstOrDefault(attachments => attachments.UserId == user.UserId);
                        if (dataUser == null)
                        {
                            MAdapter.UserList.Add(user);
                        }
                    }

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

        private void LoadContacts()
        {
            try
            {
                if (BroadcastData != null)
                {
                    BroadcastPathImage = BroadcastData.Image;
                    GlideImageLoader.LoadImage(this, BroadcastData.Image, ImageBroadcast, ImageStyle.CircleCrop, ImagePlaceholders.DrawableUser);

                    TxtBroadcastName.Text = Methods.FunString.DecodeString(BroadcastData.Name);

                    if (BroadcastData?.Users?.Count == 0) return;

                    var sss = BroadcastData?.Users?.Where(dataPart => dataPart != null).ToList();
                    foreach (var dataPart in sss)
                    {
                        MAdapter.UserList.Insert(TypePage == "Edit" ? 1 : 0, dataPart);
                    }

                    MAdapter.NotifyDataSetChanged();
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

    }
}