using Android.Content;
using Android.OS;
using Android.Views;
using Android.Widget;
using AndroidX.Core.Content;
using Bumptech.Glide;
using Bumptech.Glide.Request;
using Google.Android.Material.BottomSheet;
using Java.IO;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using WoWonder.Activities.SettingsPreferences;
using WoWonder.Activities.Story;
using WoWonder.Activities.Tab;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Fonts;
using WoWonder.Helpers.Model;
using WoWonder.Helpers.Utils;
using WoWonderClient.Classes.Global;
using WoWonderClient.Classes.Story;
using WoWonderClient.Requests;

namespace WoWonder.Activities.DefaultUser
{
    public class OptionAvatarProfileDialogFragment : BottomSheetDialogFragment
    {
        #region Variables Basic

        private RelativeLayout ViewStoryLayout, ResetAvatarLayout, SelectAvatarLayout, ViewAvatarLayout;
        private TextView ViewStoryIcon, ResetAvatarIcon, SelectAvatarIcon, ViewAvatarIcon;
        private TextView ViewStoryText, ResetAvatarText, SelectAvatarText, ViewAvatarText;

        private string Page;
        private UserDataObject UserData;

        #endregion

        #region General

        public override View OnCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState)
        {
            try
            {
                Context contextThemeWrapper = WoWonderTools.IsTabDark() ? new ContextThemeWrapper(Activity, Resource.Style.MyTheme_Dark) : new ContextThemeWrapper(Activity, Resource.Style.MyTheme);
                // clone the inflater using the ContextThemeWrapper
                LayoutInflater localInflater = inflater.CloneInContext(contextThemeWrapper);

                View view = localInflater?.Inflate(Resource.Layout.BottomSheetOptionAvatarProfileLayout, container, false);
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

                Page = Arguments?.GetString("Page") ?? "";
                UserData = JsonConvert.DeserializeObject<UserDataObject>(Arguments?.GetString("UserData") ?? "");

                InitComponent(view);
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

        #endregion

        #region Functions

        private void InitComponent(View view)
        {
            try
            {
                ViewStoryLayout = view.FindViewById<RelativeLayout>(Resource.Id.ViewStoryLayout);
                ViewStoryIcon = view.FindViewById<TextView>(Resource.Id.ViewStoryIcon);
                ViewStoryText = view.FindViewById<TextView>(Resource.Id.ViewStoryText);
                ViewStoryLayout.Click += ViewStoryLayoutOnClick;

                ResetAvatarLayout = view.FindViewById<RelativeLayout>(Resource.Id.ResetAvatarLayout);
                ResetAvatarIcon = view.FindViewById<TextView>(Resource.Id.ResetAvatarIcon);
                ResetAvatarText = view.FindViewById<TextView>(Resource.Id.ResetAvatarText);
                ResetAvatarLayout.Click += ResetAvatarLayoutOnClick;

                SelectAvatarLayout = view.FindViewById<RelativeLayout>(Resource.Id.SelectAvatarLayout);
                SelectAvatarIcon = view.FindViewById<TextView>(Resource.Id.SelectAvatarIcon);
                SelectAvatarText = view.FindViewById<TextView>(Resource.Id.SelectAvatarText);
                SelectAvatarLayout.Click += SelectAvatarLayoutOnClick;

                ViewAvatarLayout = view.FindViewById<RelativeLayout>(Resource.Id.ViewAvatarLayout);
                ViewAvatarIcon = view.FindViewById<TextView>(Resource.Id.ViewAvatarIcon);
                ViewAvatarText = view.FindViewById<TextView>(Resource.Id.ViewAvatarText);
                ViewAvatarLayout.Click += ViewAvatarLayoutOnClick;

                FontUtils.SetTextViewIcon(FontsIconFrameWork.IonIcons, ViewStoryIcon, IonIconsFonts.RadioButtonOn);
                FontUtils.SetTextViewIcon(FontsIconFrameWork.IonIcons, ResetAvatarIcon, IonIconsFonts.Refresh);
                FontUtils.SetTextViewIcon(FontsIconFrameWork.IonIcons, SelectAvatarIcon, IonIconsFonts.IosImages);
                FontUtils.SetTextViewIcon(FontsIconFrameWork.FontAwesomeSolid, ViewAvatarIcon, FontAwesomeIcon.Image);

                if (Page == "UserProfile")
                {
                    ResetAvatarLayout.Visibility = ViewStates.Gone;
                    SelectAvatarLayout.Visibility = ViewStates.Gone;
                }

                if (Page == "EditProfile")
                {
                    ViewStoryLayout.Visibility = ViewStates.Gone;
                }

                if (UserData.Avatar.Contains("d-avatar") || UserData.Avatar.Contains("f-avatar"))
                    ViewAvatarLayout.Visibility = ViewStates.Gone;

                if (!WoWonderTools.StoryIsAvailable(UserData.UserId))
                    ViewStoryLayout.Visibility = ViewStates.Gone;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Event

        private void ViewAvatarLayoutOnClick(object sender, EventArgs e)
        {
            try
            {
                if (UserData.Avatar.Contains("d-avatar") || UserData.Avatar.Contains("f-avatar"))
                    return;

                var media = WoWonderTools.GetFile(UserData.UserId, Methods.Path.FolderDcimImage, UserData.Avatar.Split('/').Last(), UserData.Avatar, "image", true);
                if (media.Contains("http"))
                {
                    var intent = new Intent(Intent.ActionView, Android.Net.Uri.Parse(media));
                    Activity.StartActivity(intent);
                }
                else
                {
                    var file2 = new File(media);
                    var photoUri = FileProvider.GetUriForFile(Activity, Activity.PackageName + ".fileprovider", file2);

                    var intent = new Intent(Intent.ActionPick);
                    intent.SetAction(Intent.ActionView);
                    intent.AddFlags(ActivityFlags.GrantReadUriPermission);
                    intent.SetDataAndType(photoUri, "image/*");
                    Activity.StartActivity(intent);
                }

                Dismiss();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void ResetAvatarLayoutOnClick(object sender, EventArgs e)
        {
            try
            {
                if (!Methods.CheckConnectivity())
                    ToastUtils.ShowToast(Context, GetString(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);
                else
                {
                    PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => RequestsAsync.Global.ResetAvatarAsync("user") });

                    UserDetails.Avatar = WoWonderTools.GetDefaultAvatar();

                    var editMyProfile = EditMyProfileActivity.GetInstance();
                    if (editMyProfile != null)
                    {
                        if (UserData.Gender == "male")
                            Glide.With(editMyProfile).Load(Resource.Drawable.no_profile_image_circle).Apply(new RequestOptions().CircleCrop()).Into(editMyProfile.ImageUser);
                        else if (UserData.Gender == "female")
                            Glide.With(editMyProfile).Load(Resource.Drawable.no_profile_female_image_circle).Apply(new RequestOptions().CircleCrop()).Into(editMyProfile.ImageUser);
                        else
                            Glide.With(editMyProfile).Load(Resource.Drawable.no_profile_image_circle).Apply(new RequestOptions().CircleCrop()).Into(editMyProfile.ImageUser);
                    }

                    var myProfile = MyProfileActivity.GetInstance();
                    if (myProfile != null)
                    {
                        if (UserData.Gender == "male")
                            Glide.With(myProfile).Load(Resource.Drawable.no_profile_image_circle).Apply(new RequestOptions().CircleCrop()).Into(myProfile.ImageUser);
                        else if (UserData.Gender == "female")
                            Glide.With(myProfile).Load(Resource.Drawable.no_profile_female_image_circle).Apply(new RequestOptions().CircleCrop()).Into(myProfile.ImageUser);
                        else
                            Glide.With(myProfile).Load(Resource.Drawable.no_profile_image_circle).Apply(new RequestOptions().CircleCrop()).Into(myProfile.ImageUser);
                    }

                    var settings = SettingsActivity.GetInstance();
                    if (settings != null)
                    {
                        if (UserData.Gender == "male")
                            Glide.With(settings).Load(Resource.Drawable.no_profile_image_circle).Apply(new RequestOptions().CircleCrop()).Into(settings.ImageUser);
                        else if (UserData.Gender == "female")
                            Glide.With(settings).Load(Resource.Drawable.no_profile_female_image_circle).Apply(new RequestOptions().CircleCrop()).Into(settings.ImageUser);
                        else
                            Glide.With(settings).Load(Resource.Drawable.no_profile_image_circle).Apply(new RequestOptions().CircleCrop()).Into(settings.ImageUser);

                        settings.MAdapter?.NotifyDataSetChanged();
                    }
                    Dismiss();
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void SelectAvatarLayoutOnClick(object sender, EventArgs e)
        {
            try
            {
                if (Page == "EditProfile")
                {
                    var instance = EditMyProfileActivity.GetInstance();
                    if (instance != null)
                    {
                        PixImagePickerUtils.OpenDialogGallery(instance);
                    }
                }
                else if (Page == "MyProfile")
                {
                    var instance = MyProfileActivity.GetInstance();
                    if (instance != null)
                    {
                        PixImagePickerUtils.OpenDialogGallery(instance);
                    }
                }
                Dismiss();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void ViewStoryLayoutOnClick(object sender, EventArgs e)
        {
            try
            {
                var tab = ChatTabbedMainActivity.GetInstance()?.LastStoriesTab;
                StoryDataObject dataMyStory = tab?.MAdapter?.StoryList?.FirstOrDefault(o => o.UserId == UserData.UserId);
                if (dataMyStory != null)
                {
                    List<StoryDataObject> storyList = new List<StoryDataObject>(tab.MAdapter.StoryList);
                    storyList.RemoveAll(o => o.Type == "Your" || o.Type == "Live");

                    Intent intent = new Intent(Activity, typeof(StoryDetailsActivity));
                    intent.PutExtra("UserId", UserData.UserId);
                    intent.PutExtra("IndexItem", 0);
                    intent.PutExtra("StoriesCount", storyList.Count);
                    intent.PutExtra("DataItem", JsonConvert.SerializeObject(new ObservableCollection<StoryDataObject>(storyList)));
                    Activity.StartActivity(intent);
                }
                Dismiss();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

    }
}