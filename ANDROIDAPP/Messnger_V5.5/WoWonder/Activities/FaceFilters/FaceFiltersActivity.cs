using AI.Deepar.AR;
using Android;
using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.Graphics;
using Android.Media;
using Android.OS;
using Android.Views;
using Android.Widget;
using AndroidX.Core.Content;
using AndroidX.RecyclerView.Widget;
using System;
using System.Collections.ObjectModel;
using System.IO;
using WoWonder.Activities.Base;
using WoWonder.Activities.FaceFilters.Adapters;
using WoWonder.Activities.FaceFilters.Tools;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Utils;
using WoWonder.Library.Anjo.Video;
using Console = System.Console;
using Environment = Android.OS.Environment;
using Exception = System.Exception;
using File = Java.IO.File;
using Task = System.Threading.Tasks.Task;

namespace WoWonder.Activities.FaceFilters
{
    [Activity(Icon = "@mipmap/icon", Theme = "@style/MyTheme", ConfigurationChanges = ConfigChanges.Locale | ConfigChanges.UiMode | ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize)]
    public class FaceFiltersActivity : BaseActivity, View.IOnTouchListener, ISurfaceHolderCallback, IAREventListener, ICameraGrabberListener, CameraButton.ICameraActionListener
    {
        #region Variables Basic


        private CameraGrabber CameraGrabber;
        private DeepAR DeepAr;

        private SurfaceView SurfaceView;

        private ImageView BackIcon, FlashButton, MaskButton, GalleryButton, StopButton, SwitchCameraButton;
        private ProgressBar ProgressBar;
        private CameraButton RecordButton;
        private LinearLayout CameraButtonLayout, MaskLayout;
        private RecyclerView MRecycler;

        private FaceAdapter MAdapter;

        private bool IsFlashOn = false;
        private string PathVideo = "";

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
                SetContentView(Resource.Layout.FaceFiltersLayout);

                RequestCamera();

                //Get Value  
                InitBackPressed("FaceFiltersActivity");
                InitComponent();
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
                SetupCamera();
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

        protected override void OnStop()
        {
            try
            {
                base.OnStop();
                if (CameraGrabber == null)
                {
                    return;
                }
                CameraGrabber.SetFrameReceiver(null);
                CameraGrabber.StopPreview();
                CameraGrabber.ReleaseCamera();
                CameraGrabber = null;
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
                DestroyBasic();

                if (DeepAr != null)
                {
                    DeepAr.SetAREventListener(null);
                    DeepAr.Release();
                }
                DeepAr = null;


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
                    FinishFaceFilter();
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
                SurfaceView = FindViewById<SurfaceView>(Resource.Id.surface);
                SurfaceView.SetOnTouchListener(this);
                SurfaceView.Holder.AddCallback(this);

                // Surface might already be initialized, so we force the call to onSurfaceChanged
                SurfaceView.Visibility = ViewStates.Gone;
                SurfaceView.Visibility = ViewStates.Visible;

                BackIcon = FindViewById<ImageView>(Resource.Id.backButton);
                FlashButton = FindViewById<ImageView>(Resource.Id.flashButton);
                MaskButton = FindViewById<ImageView>(Resource.Id.maskButton);

                CameraButtonLayout = FindViewById<LinearLayout>(Resource.Id.CameraButtonLayout);
                GalleryButton = FindViewById<ImageView>(Resource.Id.GalleryButton);

                ProgressBar = FindViewById<ProgressBar>(Resource.Id.progressBar);
                RecordButton = FindViewById<CameraButton>(Resource.Id.recordButton);
                RecordButton.SetProgressBar(ProgressBar);
                RecordButton.SetVideoDuration(AppSettings.StoryVideoDuration * 1000);
                RecordButton.SetEnableVideoRecording(true);
                RecordButton.SetEnablePhotoTaking(true);
                RecordButton.SetActionListener(this);

                StopButton = FindViewById<ImageView>(Resource.Id.stopButton);
                SwitchCameraButton = FindViewById<ImageView>(Resource.Id.switchCameraButton);

                MaskLayout = FindViewById<LinearLayout>(Resource.Id.MaskLayout);
                MRecycler = FindViewById<RecyclerView>(Resource.Id.MaskRecycler);
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
                MAdapter = new FaceAdapter(this) { FaceList = new ObservableCollection<FaceModel>() };
                var layoutManager = new LinearLayoutManager(this, LinearLayoutManager.Horizontal, false);
                MRecycler.SetLayoutManager(layoutManager);
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

        private void AddOrRemoveEvent(bool addEvent)
        {
            try
            {
                switch (addEvent)
                {
                    // true +=  // false -=
                    case true:
                        BackIcon.Click += BackIconOnClick;
                        FlashButton.Click += FlashButtonOnClick;
                        MaskButton.Click += MaskButtonOnClick;
                        GalleryButton.Click += GalleryButtonOnClick;
                        StopButton.Click += StopButtonOnClick;
                        SwitchCameraButton.Click += SwitchCameraButtonOnClick;
                        MAdapter.ItemClick += MAdapterOnItemClick;
                        break;
                    default:
                        BackIcon.Click -= BackIconOnClick;
                        FlashButton.Click -= FlashButtonOnClick;
                        MaskButton.Click -= MaskButtonOnClick;
                        GalleryButton.Click -= GalleryButtonOnClick;
                        StopButton.Click -= StopButtonOnClick;
                        SwitchCameraButton.Click -= SwitchCameraButtonOnClick;
                        MAdapter.ItemClick -= MAdapterOnItemClick;
                        break;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void DestroyBasic()
        {
            try
            {

            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Events

        private void SwitchCameraButtonOnClick(object sender, EventArgs e)
        {
            try
            {
                CameraGrabber.ChangeCameraDevice();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void StopButtonOnClick(object sender, EventArgs e)
        {
            try
            {
                DeepAr.StopVideoRecording();

                RecordButton.Visibility = ViewStates.Visible;
                StopButton.Visibility = ViewStates.Gone;
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void GalleryButtonOnClick(object sender, EventArgs e)
        {
            try
            {
                if (PermissionsController.CheckPermissionStorage(this, "file"))
                {
                    //requestCode >> 600 => Image And Video
                    new IntentController(this).OpenIntentImageAndVideoGallery(GetText(Resource.String.Lbl_SelectFile));
                }
                else
                {
                    new PermissionsController(this).RequestPermission(100, "file");
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void MaskButtonOnClick(object sender, EventArgs e)
        {
            try
            {
                if (CameraButtonLayout.Visibility == ViewStates.Invisible)
                {
                    CameraButtonLayout.Visibility = ViewStates.Visible;
                    MaskLayout.Visibility = ViewStates.Gone;
                }
                else
                {
                    CameraButtonLayout.Visibility = ViewStates.Invisible;
                    MaskLayout.Visibility = ViewStates.Visible;

                    MAdapter.FaceList = FaceFiltersUtils.FaceFiltersList;
                    MAdapter.NotifyDataSetChanged();
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void FlashButtonOnClick(object sender, EventArgs e)
        {
            try
            {
                ToggleFlash();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void BackIconOnClick(object sender, EventArgs e)
        {
            try
            {
                RecordButton.CancelRecording();
                FinishFaceFilter();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private async void MAdapterOnItemClick(object sender, FaceAdapterClickEventArgs e)
        {
            try
            {
                var item = MAdapter.GetItem(e.Position);
                if (item != null)
                {
                    var path = await FaceFiltersUtils.GetFilterPath(item.Name, item.Url);
                    DeepAr.SwitchEffect("mask", "");
                    DeepAr.SwitchEffect("face", "");
                    DeepAr.SwitchEffect("background", "");
                    DeepAr.SwitchEffect(item.Type, path);
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
                if (requestCode == 600 && resultCode == Result.Ok) // image or video
                {
                    var filepath = Methods.AttachmentFiles.GetActualPathFromFile(this, data.Data);
                    if (filepath != null)
                    {
                        var type = Methods.AttachmentFiles.Check_FileExtension(filepath);
                        if (type is "Image" or "Video")
                        {
                            FinishFaceFilter(filepath);
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

                if (requestCode == 103)
                {
                    if (grantResults.Length > 0 && grantResults[0] == Permission.Granted)
                    {
                        InitializeDeepAr();
                    }
                    else
                    {
                        ToastUtils.ShowToast(this, GetText(Resource.String.Lbl_Permission_is_denied), ToastLength.Long);
                    }
                }
                else if (requestCode == 100)
                {
                    if (grantResults.Length > 0 && grantResults[0] == Permission.Granted)
                    {
                        //requestCode >> 600 => Image And Video
                        new IntentController(this).OpenIntentImageAndVideoGallery(GetText(Resource.String.Lbl_SelectFile));
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

        #region Back Pressed

        public void BackPressed()
        {
            FinishFaceFilter();
        }

        #endregion

        #region DeepAr

        private void RequestCamera()
        {
            try
            {
                if ((int)Build.VERSION.SdkInt < 23)
                {
                    InitializeDeepAr();
                }
                else
                {
                    if (ContextCompat.CheckSelfPermission(this, Manifest.Permission.Camera) == Permission.Granted)
                    {
                        InitializeDeepAr();
                    }
                    else
                    {
                        //request Code 103
                        new PermissionsController(this).RequestPermission(103);
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void InitializeDeepAr()
        {
            try
            {
                DeepAr = new DeepAR(this);
                DeepAr.SetLicenseKey(AppSettings.DeepArKey);
                DeepAr.Initialize(this, this);
                //DeepAr.ChangeLiveMode(false);

                SetupCamera();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void SetupCamera()
        {
            try
            {
                CameraGrabber = new CameraGrabber(this, DeepAr);
                CameraGrabber.InitCamera(this);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public bool OnTouch(View v, MotionEvent e)
        {
            try
            {
                switch (e.Action)
                {
                    case MotionEventActions.Down:
                        DeepAr.TouchOccurred(new ARTouchInfo(e.GetX(), e.GetY(), ARTouchType.Start));
                        return true;
                    case MotionEventActions.Move:
                        DeepAr.TouchOccurred(new ARTouchInfo(e.GetX(), e.GetY(), ARTouchType.Move));
                        return true;
                    case MotionEventActions.Up:
                        DeepAr.TouchOccurred(new ARTouchInfo(e.GetX(), e.GetY(), ARTouchType.End));
                        return true;
                }
                return false;
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
                return false;
            }
        }

        #region Surface

        public void SurfaceChanged(ISurfaceHolder holder, Format format, int width, int height)
        {
            try
            {
                // If we are using on screen rendering we have to set surface view where DeepAR will render
                if (DeepAr != null)
                    DeepAr.SetRenderSurface(holder.Surface, width, height);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void SurfaceCreated(ISurfaceHolder holder)
        {

        }

        public void SurfaceDestroyed(ISurfaceHolder holder)
        {
            try
            {
                if (DeepAr != null)
                    DeepAr.SetRenderSurface(null, 0, 0);

            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region IAREventListener

        public void EffectSwitched(string p0)
        {

        }

        public void Error(ARErrorType p0, string p1)
        {
            Console.WriteLine("AREventListener Error : " + p1);
        }

        public void FaceVisibilityChanged(bool p0)
        {

        }

        public void FrameAvailable(Image p0)
        {

        }

        public void ImageVisibilityChanged(string p0, bool p1)
        {

        }

        public void Initialized()
        {
            Console.WriteLine("AREventListener Initialized");
        }

        public async void ScreenshotTaken(Bitmap bitmap)
        {
            try
            {
                File imageFile = new File(Environment.GetExternalStoragePublicDirectory(Environment.DirectoryPictures), "image_" + DateTime.Now.ToString("yyyy_MM_dd_hh_mm_ss") + ".jpg");

                var stream = new FileStream(imageFile.Path, FileMode.Create);
                await bitmap.CompressAsync(Bitmap.CompressFormat.Jpeg, 100, stream);
                stream.Flush();
                stream.Close();

                Intent mediaScanIntent = new Intent(Intent.ActionMediaScannerScanFile);
                Android.Net.Uri contentUri = Android.Net.Uri.FromFile(imageFile);
                mediaScanIntent.SetData(contentUri);
                SendBroadcast(mediaScanIntent);

                await Task.Delay(500);
                //Toast.MakeText(this, "Screenshot " + imageFile.Name + " saved.", ToastLength.Short)?.Show();

                FinishFaceFilter(imageFile.Path);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void ShutdownFinished()
        {

        }

        public void VideoRecordingFailed()
        {
            try
            {
                PathVideo = "";
                Toast.MakeText(this, GetText(Resource.String.Lbl_FailedToSaveVideo), ToastLength.Short)?.Show();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public async void VideoRecordingFinished()
        {
            try
            {
                if (!string.IsNullOrEmpty(PathVideo))
                {
                    MediaScannerConnection.ScanFile(this, new string[] { PathVideo }, null, null);

                    await Task.Delay(500);

                    //Toast.MakeText(this, "Video is saved.", ToastLength.Short)?.Show();

                    FinishFaceFilter(PathVideo);
                }
                PathVideo = "";
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void VideoRecordingPrepared()
        {

        }

        public void VideoRecordingStarted()
        {

        }

        #endregion

        #region ICameraGrabberListener

        public void OnCameraInitialized()
        {
            try
            {
                var camera = CameraGrabber.GetCurrentCamera();
                if (camera == null || camera.CameraControl == null)
                {
                    return;
                }

                if (camera.CameraInfo.HasFlashUnit)
                {
                    FlashButton.Visibility = ViewStates.Visible;
                }
                else
                {
                    //Flash is not available 
                    FlashButton.Visibility = ViewStates.Gone;
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        public void OnCameraError(string errorMsg)
        {
            try
            {
                Toast.MakeText(this, errorMsg, ToastLength.Short)?.Show();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #endregion

        private void ToggleFlash()
        {
            try
            {
                var camera = CameraGrabber.GetCurrentCamera();
                if (camera == null || camera.CameraControl == null)
                {
                    return;
                }

                IsFlashOn = !IsFlashOn;
                camera.CameraControl.EnableTorch(IsFlashOn);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #region CameraVideoButton

        public void OnStartRecord()
        {
            try
            {
                string time = "" + Methods.Time.CurrentTimeMillis();
                PathVideo = Environment.GetExternalStoragePublicDirectory(Environment.DirectoryMovies) + File.Separator + time + ".mp4";
                DeepAr.StartVideoRecording(PathVideo);

                //RecordButton.Visibility = ViewStates.Gone;
                //StopButton.Visibility = ViewStates.Visible;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnEndRecord()
        {
            try
            {
                DeepAr.StopVideoRecording();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnDurationTooShortError()
        {
            try
            {
                DeepAr.StopVideoRecording();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnSingleTap()
        {
            try
            {
                DeepAr.TakeScreenshot();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnCancelled()
        {

        }

        #endregion

        private void FinishFaceFilter(string path = "")
        {
            try
            {
                var resultIntent = new Intent();
                if (!string.IsNullOrEmpty(path))
                {
                    resultIntent.PutExtra("FilePath", path);
                    SetResult(Result.Ok, resultIntent);
                    Finish();
                }
                else
                {
                    SetResult(Result.Canceled, resultIntent);
                    Finish();
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                Finish();
            }
        }

    }
}