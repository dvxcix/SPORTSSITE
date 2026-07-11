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
using Bumptech.Glide;
using Bumptech.Glide.Request;
using Com.Google.Android.Gms.Ads.Admanager;
using Google.Android.Material.Dialog;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using WoWonder.Activities.Base;
using WoWonder.Activities.SettingsPreferences;
using WoWonder.Helpers.Ads;
using WoWonder.Helpers.CacheLoaders;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Model;
using WoWonder.Helpers.Utils;
using WoWonder.SQLite;
using WoWonderClient.Classes.Global;
using WoWonderClient.Classes.User;
using WoWonderClient.Requests;
using Console = System.Console;
using Exception = System.Exception;
using Toolbar = AndroidX.AppCompat.Widget.Toolbar;

namespace WoWonder.Activities.DefaultUser
{
    [Activity(Icon = "@mipmap/icon", Theme = "@style/MyTheme", ConfigurationChanges = ConfigChanges.Locale | ConfigChanges.UiMode | ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize)]
    public class EditMyProfileActivity : BaseActivity, IDialogListCallBack
    {
        #region Variables Basic

        public ImageView ImageUser, BtnSelectImage;

        private AppCompatButton BtnSave;
        private EditText TxtAboutUser;

        private LinearLayout FacebookLiner, TwitterLiner, InstagramLiner, VkLiner, YoutubeLiner;
        private EditText TextFacebook, TextTwitter, TextInstagram, TextVk, TextYoutube;

        private LinearLayout NameLiner, WorkLiner, StudyLiner, CountryLiner, MobileLiner, WebsiteLiner, RelationshipLiner;
        private EditText TextFirstName, TextLastName, TextWork, TextStudy, TextCountry, TextMobile, TextWebsite, TextRelationship;

        private AdManagerAdView AdManagerAdView;
        private string DialogType = "", CountryId, IdRelationShip, PathImage;
        private static EditMyProfileActivity Instance;
        private UserDataObject UserData;

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
                SetContentView(Resource.Layout.EditMyProfileLayout);
                Instance = this;

                //Get Value And Set Toolbar
                InitComponent();
                InitToolbar();
                GetMyInfoData();

                AdsGoogle.Ad_Interstitial(this);
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
                AdManagerAdView?.Resume();
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
                AdManagerAdView?.Pause();
                base.OnPause();
                AddOrRemoveEvent(false);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override void OnTrimMemory(TrimMemory level)
        {
            try
            {
                GC.Collect(GC.MaxGeneration, GCCollectionMode.Forced);
                base.OnTrimMemory(level);
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

        protected override void OnDestroy()
        {
            try
            {
                Instance = null;
                AdManagerAdView?.Destroy();

                base.OnDestroy();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Menu

        public override bool OnOptionsItemSelected(IMenuItem item)
        {
            switch (item.ItemId)
            {
                case Android.Resource.Id.Home:
                    var resultIntent = new Intent();
                    SetResult(Result.Ok, resultIntent);
                    Finish();
                    return true;
            }

            return base.OnOptionsItemSelected(item);
        }

        #endregion

        #region Functions

        private void InitComponent()
        {
            try
            {
                BtnSave = FindViewById<AppCompatButton>(Resource.Id.SaveButton);

                ImageUser = FindViewById<ImageView>(Resource.Id.image);
                BtnSelectImage = FindViewById<ImageView>(Resource.Id.ChooseImageText);

                TxtAboutUser = FindViewById<EditText>(Resource.Id.AboutEditText);

                FacebookLiner = FindViewById<LinearLayout>(Resource.Id.LayoutFacebook);
                TextFacebook = FindViewById<EditText>(Resource.Id.FacebookEditText);

                TwitterLiner = FindViewById<LinearLayout>(Resource.Id.LayoutTwitter);
                TextTwitter = FindViewById<EditText>(Resource.Id.TwitterEditText);

                InstagramLiner = FindViewById<LinearLayout>(Resource.Id.LayoutInstagram);
                TextInstagram = FindViewById<EditText>(Resource.Id.InstagramEditText);

                VkLiner = FindViewById<LinearLayout>(Resource.Id.LayoutVK);
                TextVk = FindViewById<EditText>(Resource.Id.VKEditText);

                YoutubeLiner = FindViewById<LinearLayout>(Resource.Id.LayoutYoutube);
                TextYoutube = FindViewById<EditText>(Resource.Id.YoutubeEditText);

                NameLiner = FindViewById<LinearLayout>(Resource.Id.LayoutWork);
                TextFirstName = FindViewById<EditText>(Resource.Id.FirstNameEditText);
                TextLastName = FindViewById<EditText>(Resource.Id.LastNameEditText);

                WorkLiner = FindViewById<LinearLayout>(Resource.Id.LayoutWork);
                TextWork = FindViewById<EditText>(Resource.Id.WorkEditText);

                StudyLiner = FindViewById<LinearLayout>(Resource.Id.LayoutStudy);
                TextStudy = FindViewById<EditText>(Resource.Id.StudyEditText);

                CountryLiner = FindViewById<LinearLayout>(Resource.Id.LayoutCountry);
                TextCountry = FindViewById<EditText>(Resource.Id.CountryEditText);

                MobileLiner = FindViewById<LinearLayout>(Resource.Id.LayoutMobile);
                TextMobile = FindViewById<EditText>(Resource.Id.MobileEditText);

                WebsiteLiner = FindViewById<LinearLayout>(Resource.Id.LayoutWebsite);
                TextWebsite = FindViewById<EditText>(Resource.Id.WebsiteEditText);

                RelationshipLiner = FindViewById<LinearLayout>(Resource.Id.LayoutRelationship);
                TextRelationship = FindViewById<EditText>(Resource.Id.RelationshipEditText);

                AdManagerAdView = FindViewById<AdManagerAdView>(Resource.Id.multiple_ad_sizes_view);
                AdsGoogle.InitAdManagerAdView(AdManagerAdView);

                Methods.SetFocusable(TextCountry);
                Methods.SetFocusable(TextRelationship);
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
                    toolbar.Title = GetText(Resource.String.Lbl_Edit_Profile_and_avatar);
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

        private void AddOrRemoveEvent(bool addEvent)
        {
            try
            {
                // true +=  // false -=
                if (addEvent)
                {
                    BtnSelectImage.Click += BtnSelectImageOnClick;
                    BtnSave.Click += BtnSaveOnClick;
                    TextCountry.Touch += TextCountryOnTouch;
                    TextRelationship.Touch += TextRelationshipOnTouch;
                }
                else
                {
                    BtnSelectImage.Click -= BtnSelectImageOnClick;
                    BtnSave.Click -= BtnSaveOnClick;
                    TextCountry.Touch -= TextCountryOnTouch;
                    TextRelationship.Touch -= TextRelationshipOnTouch;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public static EditMyProfileActivity GetInstance()
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

        private void BtnSelectImageOnClick(object sender, EventArgs e)
        {
            try
            {
                OptionAvatarProfileDialogFragment dialogFragment = new OptionAvatarProfileDialogFragment();
                Bundle bundle = new Bundle();
                bundle.PutString("Page", "EditProfile");
                bundle.PutString("UserData", JsonConvert.SerializeObject(UserData));

                dialogFragment.Arguments = bundle;

                dialogFragment.Show(SupportFragmentManager, dialogFragment.Tag);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private async void BtnSaveOnClick(object sender, EventArgs e)
        {
            try
            {
                if (Methods.CheckConnectivity())
                {
                    //Show a progress
                    AndHUD.Shared.Show(this, GetText(Resource.String.Lbl_Loading));

                    var dataUser = ListUtils.MyProfileList?.FirstOrDefault();

                    var dictionary = new Dictionary<string, string>
                    {
                        {"first_name", TextFirstName.Text},
                        {"last_name", TextLastName.Text},
                        {"about", TxtAboutUser.Text},
                        {"phone_number", TextMobile.Text},
                        {"facebook", TextFacebook.Text},
                        {"twitter", TextTwitter.Text},
                        {"youtube", TextYoutube.Text},
                        {"instagram", TextInstagram.Text},
                        {"vk", TextVk.Text},
                        {"website", TextWebsite.Text},
                        {"working", TextWork.Text},
                        {"school", TextStudy.Text},
                        {"relationship", IdRelationShip},
                        {"country_id", CountryId},
                    };

                    var (apiStatus, respond) = await RequestsAsync.Global.UpdateUserDataAsync(dictionary);
                    if (apiStatus == 200)
                    {
                        if (respond is MessageObject result1 && result1.Message.Contains("updated"))
                        {
                            ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_YourDetailsWasUpdated), ToastLength.Short);

                            if (dataUser != null)
                            {
                                dataUser.FirstName = TextFirstName.Text;
                                dataUser.LastName = TextLastName.Text;
                                dataUser.PhoneNumber = TextMobile.Text;
                                dataUser.Website = TextWebsite.Text;
                                dataUser.Working = TextWork.Text;
                                dataUser.School = TextStudy.Text;
                                dataUser.CountryId = CountryId;
                                dataUser.RelationshipId = IdRelationShip;

                                var sqLiteDatabase = new SqLiteDatabase();
                                sqLiteDatabase.Insert_Or_Update_To_MyProfileTable(dataUser);
                            }

                            AndHUD.Shared.Dismiss();

                            var resultIntent = new Intent();
                            SetResult(Result.Ok, resultIntent);
                            Finish();
                        }
                        else if (respond is MessageObject result2)
                        {
                            //Show a Error image with a message
                            AndHUD.Shared.ShowError(this, result2.Message, MaskType.Clear, TimeSpan.FromSeconds(1));
                        }
                    }
                    else
                        Methods.DisplayAndHudErrorResult(this, respond);
                }
                else
                {
                    ToastUtils.ShowToast(this, GetString(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);
                }
            }
            catch (Exception exception)
            {
                Console.WriteLine(exception);
            }
        }

        private void TextCountryOnTouch(object sender, View.TouchEventArgs e)
        {
            try
            {
                if (e?.Event?.Action != MotionEventActions.Up) return;
                Methods.HideKeyboard(this);
                DialogType = "Country";

                var countriesArray = WoWonderTools.GetCountryList(this);

                var dialogList = new MaterialAlertDialogBuilder(this);

                var arrayAdapter = countriesArray.Select(item => item.Value).ToList();

                dialogList.SetTitle(GetText(Resource.String.Lbl_Location));
                dialogList.SetItems(arrayAdapter.ToArray(), new MaterialDialogUtils(arrayAdapter, this));
                dialogList.SetNegativeButton(GetText(Resource.String.Lbl_Close), new MaterialDialogUtils());

                dialogList.Show();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void TextRelationshipOnTouch(object sender, View.TouchEventArgs e)
        {
            try
            {
                if (e?.Event?.Action != MotionEventActions.Up) return;
                Methods.HideKeyboard(this);
                DialogType = "Relationship";

                string[] relationshipArray = Application.Context.Resources?.GetStringArray(Resource.Array.RelationShipArray);

                var dialogList = new MaterialAlertDialogBuilder(this);

                var arrayAdapter = relationshipArray?.ToList();

                dialogList.SetTitle(GetText(Resource.String.Lbl_ChooseRelationshipStatus));
                dialogList.SetItems(arrayAdapter.ToArray(), new MaterialDialogUtils(arrayAdapter, this));
                dialogList.SetNegativeButton(GetText(Resource.String.Lbl_Close), new MaterialDialogUtils());

                dialogList.Show();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Permissions && Result

        //Result
        protected override async void OnActivityResult(int requestCode, Result resultCode, Intent data)
        {
            try
            {
                base.OnActivityResult(requestCode, resultCode, data);
                if (requestCode == PixImagePickerActivity.RequestCode && resultCode == Result.Ok)
                {
                    var listPath = JsonConvert.DeserializeObject<ResultIntentPixImage>(data.GetStringExtra("ResultPixImage") ?? "");
                    if (listPath?.List?.Count > 0)
                    {
                        foreach (var filepath in listPath?.List)
                        {
                            if (!string.IsNullOrEmpty(filepath))
                            {
                                var (check, info) = await WoWonderTools.CheckMimeTypesWithServer(filepath);
                                if (!check)
                                {
                                    if (info == "AdultImages")
                                    {
                                        ToastUtils.ShowToast(this, GetString(Resource.String.Lbl_Error_AdultImages), ToastLength.Short);
                                    }
                                    else
                                    {
                                        //this file not supported on the server , please select another file 
                                        ToastUtils.ShowToast(this, GetString(Resource.String.Lbl_ErrorFileNotSupported), ToastLength.Short);
                                    }
                                    return;
                                }

                                PathImage = filepath;
                                UserDetails.Avatar = filepath;

                                //File file2 = new File(resultUri.Path);
                                //var photoUri = FileProvider.GetUriForFile(this, PackageName + ".fileprovider", file2);
                                Glide.With(this).Load(filepath).Apply(new RequestOptions().CircleCrop()).Into(ImageUser);

                                var myProfile = MyProfileActivity.GetInstance();
                                if (myProfile != null)
                                {
                                    Glide.With(myProfile).Load(filepath).Apply(new RequestOptions().CircleCrop()).Into(myProfile.ImageUser);
                                }

                                var settings = SettingsActivity.GetInstance();
                                if (settings != null)
                                {
                                    Glide.With(settings).Load(filepath).Apply(new RequestOptions().CircleCrop()).Into(settings.ImageUser);
                                    settings.MAdapter?.NotifyDataSetChanged();
                                }

                                //GlideImageLoader.LoadImage(this, resultUri.Path, ImgCover, ImageStyle.CenterCrop, ImagePlaceholders.Drawable);
                                PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => Update_Image_Api(filepath) });
                            }
                            else
                            {
                                ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_Failed_to_load), ToastLength.Short);
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


        //Permissions
        public override void OnRequestPermissionsResult(int requestCode, string[] permissions, Permission[] grantResults)
        {
            try
            {
                base.OnRequestPermissionsResult(requestCode, permissions, grantResults);

                switch (requestCode)
                {
                    case 108 when grantResults.Length > 0 && grantResults[0] == Permission.Granted:
                        PixImagePickerUtils.OpenDialogGallery(this);
                        break;
                    case 108:
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

        #region Get Data User

        //Get Data User From Database 
        private void GetMyInfoData()
        {
            try
            {
                UserDataObject dataUser = ListUtils.MyProfileList.FirstOrDefault();
                LoadDataUser(dataUser);

                Task.Factory.StartNew(StartApiService);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        //Get Data My Profile API
        private void StartApiService()
        {
            if (!Methods.CheckConnectivity())
                ToastUtils.ShowToast(this, GetString(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);
            else
                PollyController.RunRetryPolicyFunction(new List<Func<Task>> { GetProfileApi });
        }

        private async Task GetProfileApi()
        {
            var (apiStatus, respond) = await RequestsAsync.Global.GetUserDataAsync(UserDetails.UserId, "user_data");

            if (apiStatus != 200 || respond is not GetUserDataObject result || result.UserData == null)
            {
                Methods.DisplayReportResult(this, respond);
            }
            else
            {
                RunOnUiThread(() => LoadDataUser(result.UserData));
            }
        }

        private void LoadDataUser(UserDataObject data)
        {
            try
            {
                UserData = data;

                GlideImageLoader.LoadImage(this, data.Avatar, ImageUser, ImageStyle.CircleCrop, ImagePlaceholders.DrawableUser);

                TextFirstName.Text = data.FirstName;
                TextLastName.Text = data.LastName;

                TxtAboutUser.Text = WoWonderTools.GetAboutFinal(data);

                TextFacebook.Text = data.Facebook;
                TextTwitter.Text = data.Twitter;
                TextInstagram.Text = data.Instagram;
                TextVk.Text = data.Vk;
                TextYoutube.Text = data.Youtube;

                TextWork.Text = data.Working;
                TextStudy.Text = data.School;

                if (!string.IsNullOrEmpty(data.CountryId) && data.CountryId != "0")
                {
                    var countryName = WoWonderTools.GetCountryList(this).FirstOrDefault(a => a.Key == data.CountryId).Value;
                    TextCountry.Text = countryName;
                }

                TextMobile.Text = data.PhoneNumber;
                TextWebsite.Text = data.Website;

                IdRelationShip = data.RelationshipId;
                string relationship = WoWonderTools.GetRelationship(Convert.ToInt32(data.RelationshipId));
                if (!string.IsNullOrEmpty(relationship))
                {
                    TextRelationship.Text = relationship;
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
                if (DialogType == "Relationship")
                {
                    IdRelationShip = position.ToString();
                    TextRelationship.Text = itemString;
                }
                else if (DialogType == "Country")
                {
                    var countriesArray = WoWonderTools.GetCountryList(this);
                    var check = countriesArray.FirstOrDefault(a => a.Value == itemString).Key;
                    if (check != null)
                    {
                        CountryId = check;
                    }

                    TextCountry.Text = itemString;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        private async Task Update_Image_Api(string path)
        {
            try
            {
                if (!Methods.CheckConnectivity())
                {
                    ToastUtils.ShowToast(this, GetString(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);
                }
                else
                {
                    var (apiStatus, respond) = await RequestsAsync.Global.UpdateUserAvatarAsync(path);
                    if (apiStatus == 200)
                    {
                        if (respond is MessageObject result)
                        {
                            Console.WriteLine(result.Message);
                            ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_Image_changed_successfully), ToastLength.Short);
                        }
                    }
                    else
                        Methods.DisplayReportResult(this, respond);
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

    }
}