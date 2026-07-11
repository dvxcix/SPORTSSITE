using Android.Graphics;
using Android.OS;
using Android.Views;
using Android.Widget;
using AndroidHUD;
using AndroidX.AppCompat.Widget;
using Bumptech.Glide;
using Bumptech.Glide.Request;
using Google.ZXing;
using Google.ZXing.Common;
using System;
using System.Linq;
using WoWonder.Helpers.CacheLoaders;
using WoWonder.Helpers.Utils;
using WoWonderClient.Classes.Global;

namespace WoWonder.Activities.QrCode.Fragment
{
    public class MyQrCodeFragment : AndroidX.Fragment.App.Fragment
    {
        #region Variables Basic

        private ImageView QrImage, ProfileAvatarImage;
        private TextView TxtUsername;
        private AppCompatButton BtnShare, BtnSave;
        private Bitmap BitmapImage;
        private string UrlUserData;

        #endregion

        #region General

        public override View OnCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState)
        {
            try
            {
                View view = inflater.Inflate(Resource.Layout.MyQrCodeLayout, container, false);
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
                AddOrRemoveEvent(true);
                Get_Data_User();
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
                TxtUsername = view.FindViewById<TextView>(Resource.Id.TxtUsername);
                QrImage = view.FindViewById<ImageView>(Resource.Id.qr_image);
                ProfileAvatarImage = view.FindViewById<ImageView>(Resource.Id.profileAvatar_image);
                BtnShare = view.FindViewById<AppCompatButton>(Resource.Id.share);
                BtnSave = view.FindViewById<AppCompatButton>(Resource.Id.save);
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
                switch (addEvent)
                {
                    // true +=  // false -=
                    case true:
                        BtnShare.Click += BtnShareOnClick;
                        BtnSave.Click += BtnSaveOnClick;
                        break;
                    default:
                        BtnShare.Click -= BtnShareOnClick;
                        BtnSave.Click -= BtnSaveOnClick;
                        break;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Events

        private void BtnSaveOnClick(object sender, EventArgs e)
        {
            try
            {
                if (BitmapImage == null) return;

                var path = Methods.MultiMedia.Export_Bitmap_As_Image(BitmapImage, "QrCode_Image", Methods.Path.FolderDcimImage);
                Methods.CapturePhotoUtils.InsertImage(Activity.ContentResolver, path).ConfigureAwait(false);

                ToastUtils.ShowToast(Activity, Activity.GetText(Resource.String.Lbl_ImageSaved), ToastLength.Short);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private async void BtnShareOnClick(object sender, EventArgs e)
        {
            try
            {
                if (BitmapImage == null) return;

                var path = Methods.MultiMedia.Export_Bitmap_As_Image(BitmapImage, "QrCode_Image", Methods.Path.FolderDcimImage);
                //path = Methods.CapturePhotoUtils.InsertImage(Activity.ContentResolver, path);

                await ShareFileImplementation.ShareRemoteFile(Activity, UrlUserData, path, "QrCode_Image.png", Context.GetText(Resource.String.Lbl_SendTo));
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Get QR

        private void GetQrCodeAsync(string text)
        {
            try
            {
                //Show a progress
                AndHUD.Shared.Show(Context, GetText(Resource.String.Lbl_Loading));

                BitMatrix result = new MultiFormatWriter().Encode(text, BarcodeFormat.QrCode, 900, 900, null);

                int width = result.Width;
                int height = result.Height;
                int[] pixels = new int[width * height];
                for (int y = 0; y < height; y++)
                {
                    int offset = y * width;
                    for (int x = 0; x < width; x++)
                    {
                        pixels[offset + x] = result.Get(x, y) ? Color.Black : Color.White;
                    }
                }

                BitmapImage = Bitmap.CreateBitmap(width, height, Bitmap.Config.Argb8888);
                BitmapImage.SetPixels(pixels, 0, width, 0, 0, width, height);

                Glide.With(this).AsBitmap().Load(BitmapImage).Apply(new RequestOptions()).Into(QrImage);
                AndHUD.Shared.Dismiss();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                AndHUD.Shared.Dismiss();
            }
        }

        #endregion

        private void Get_Data_User()
        {
            try
            {
                UserDataObject local = ListUtils.MyProfileList?.FirstOrDefault();
                if (local != null)
                {
                    UrlUserData = local.Url;

                    TxtUsername.Text = "@" + local.Username;

                    GlideImageLoader.LoadImage(Activity, local.Avatar, ProfileAvatarImage, ImageStyle.CircleCrop, ImagePlaceholders.DrawableUser);

                    QrImage.Post(() =>
                    {
                        GetQrCodeAsync(local.Url);
                    });
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }
}