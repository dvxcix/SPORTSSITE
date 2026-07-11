using Android;
using Android.Content.PM;
using Android.OS;
using Android.Util;
using Android.Views;
using Android.Widget;
using AndroidHUD;
using AndroidX.Camera.Core;
using AndroidX.Camera.Lifecycle;
using AndroidX.Camera.View;
using AndroidX.Core.Content;
using Google.Android.Material.Dialog;
using Google.Common.Util.Concurrent;
using Java.Lang;
using System;
using System.Linq;
using WoWonder.Activities.QrCode.Tools;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Utils;
using WoWonderClient;
using WoWonderClient.Classes.Global;
using WoWonderClient.Requests;
using Exception = System.Exception;

namespace WoWonder.Activities.QrCode.Fragment
{
    public class QrScannerFragment : AndroidX.Fragment.App.Fragment, IQrCodeFoundListener
    {
        #region Variables Basic

        private PreviewView PreviewView;
        private IListenableFuture CameraProviderFuture;
        private bool MIsVisibleToUser;

        /// Internal variables
        private ProcessCameraProvider CameraProvider;
        private ICamera Camera;
        private Preview Preview;

        #endregion

        #region General

        public override View OnCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState)
        {
            try
            {
                View view = inflater.Inflate(Resource.Layout.QrCodeScanLayout, container, false);
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
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
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
                    RequestCamera();
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
                StopCamera();
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
                PreviewView = view.FindViewById<PreviewView>(Resource.Id.activity_main_previewView);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Camera

        public void RequestCamera()
        {
            try
            {
                if ((int)Build.VERSION.SdkInt < 23)
                {
                    StartCamera();
                }
                else
                {
                    if (ContextCompat.CheckSelfPermission(Context, Manifest.Permission.Camera) == Permission.Granted)
                    {
                        StartCamera();
                    }
                    else
                    {
                        //request Code 103
                        new PermissionsController(Activity).RequestPermission(103);
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void StartCamera()
        {
            try
            {
                if (CameraProviderFuture == null)
                {
                    CameraProviderFuture = ProcessCameraProvider.GetInstance(Activity);

                    CameraProviderFuture.AddListener(new Runnable(() =>
                    {
                        try
                        {
                            var cameraProvider = CameraProviderFuture.Get();
                            if (cameraProvider is ProcessCameraProvider provider)
                            {
                                BindCameraPreview(provider);
                            }
                        }
                        catch (Exception e)
                        {
                            Methods.DisplayReportResultTrack(e);
                        }
                    }), ContextCompat.GetMainExecutor(Activity));
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void BindCameraPreview(ProcessCameraProvider provider)
        {
            try
            {
                // Preview
                Preview = new Preview.Builder()
                    .Build();

                // Select back camera as a default
                CameraSelector cameraSelector = new CameraSelector.Builder()
                    .RequireLensFacing(CameraSelector.LensFacingBack)
                    .Build();

                Preview.SetSurfaceProvider(PreviewView.SurfaceProvider);

                ImageAnalysis imageAnalysis = new ImageAnalysis.Builder()
                    .SetTargetResolution(new Size(1280, 720))
                    .SetTargetRotation((int)SurfaceOrientation.Rotation0)
                    .SetBackpressureStrategy(ImageAnalysis.StrategyKeepOnlyLatest)
                    .Build();

                imageAnalysis.SetAnalyzer(ContextCompat.GetMainExecutor(Activity), new QrCodeImageAnalyzer(Activity, this));

                // Unbind use cases before rebinding
                provider.UnbindAll();

                // Bind use cases to camera
                Camera = provider.BindToLifecycle(this, cameraSelector, imageAnalysis, Preview);

                if (Camera.CameraInfo.HasFlashUnit)
                {
                    Camera.CameraControl.EnableTorch(false);
                }
                CameraProvider = provider;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void StopCamera()
        {
            try
            {
                if (IsStopped())
                    return;

                Camera?.CameraInfo.TorchState.RemoveObservers(this);
                CameraProvider?.UnbindAll();

                Camera = null;
                Preview = null;
                CameraProvider = null;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private bool IsStopped()
        {
            return Camera == null && Preview == null;
        }

        #endregion

        #region Listener Camera

        public void OnQrCodeFound(string qrCode)
        {
            try
            {
                if (string.IsNullOrEmpty(qrCode))
                    return;

                if (!qrCode.Contains(InitializeWoWonder.WebsiteUrl))
                {
                    ToastUtils.ShowToast(Activity, GetString(Resource.String.Lbl_ThereNoUserForThisCode), ToastLength.Short);
                    return;
                }

                OpenQrCode(qrCode);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void QrCodeNotFound()
        {

        }

        #endregion

        #region Get Type QR Code

        private string Name;

        private async void OpenQrCode(string qrCode)
        {
            try
            {
                if (string.IsNullOrEmpty(qrCode))
                    return;

                if (!qrCode.Contains(InitializeWoWonder.WebsiteUrl))
                {
                    ToastUtils.ShowToast(Activity, GetString(Resource.String.Lbl_ThereNoUserForThisCode), ToastLength.Short);
                    return;
                }

                if (Methods.CheckConnectivity())
                {
                    var username = qrCode.Split("/").LastOrDefault();

                    if (Name == username)
                        return;

                    Name = username;

                    //Show a progress
                    AndHUD.Shared.Show(Activity, GetText(Resource.String.Lbl_Loading));

                    var (apiStatus, respond) = await RequestsAsync.Global.CheckTypeUrlAsync(username);
                    if (apiStatus == 200)
                    {
                        if (respond is TypeUrlObject result)
                        {
                            AndHUD.Shared.Dismiss();

                            var dialog = new MaterialAlertDialogBuilder(Context);
                            dialog.SetTitle(GetText(Resource.String.Lbl_Ask_OpenThisProfile) + " @" + username);
                            dialog.SetPositiveButton(GetText(Resource.String.Lbl_Open), (materialDialog, action) =>
                            {
                                try
                                {
                                    switch (result.Type)
                                    {
                                        case "user":
                                            WoWonderTools.OpenProfile(Activity, result.Id, null);
                                            break;
                                        case "page":
                                            {

                                                //var intent = new Intent(Activity, typeof(PageProfileActivity));
                                                ////intent.PutExtra("PageObject", JsonConvert.SerializeObject(item));
                                                //intent.PutExtra("PageId", result.Id);
                                                //Activity.StartActivity(intent);
                                                break;
                                            }
                                        case "group":
                                            {

                                                //var intent = new Intent(Activity, typeof(GroupProfileActivity));
                                                ////intent.PutExtra("GroupObject", JsonConvert.SerializeObject(item));
                                                //intent.PutExtra("GroupId", result.Id);
                                                //Activity.StartActivity(intent);
                                                break;
                                            }
                                    }
                                    Activity.Finish();
                                }
                                catch (Exception e)
                                {
                                    Methods.DisplayReportResultTrack(e);
                                }
                            });
                            dialog.SetNegativeButton(GetText(Resource.String.Lbl_Close), new MaterialDialogUtils());
                            dialog.Show();
                        }
                    }
                    else
                    {
                        ToastUtils.ShowToast(Activity, GetString(Resource.String.Lbl_ThereNoUserForThisCode), ToastLength.Short);
                        Methods.DisplayAndHudErrorResult(Activity, respond);
                    }
                }
                else
                {
                    ToastUtils.ShowToast(Activity, GetString(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);
                }
            }
            catch (Exception exception)
            {
                ToastUtils.ShowToast(Activity, GetString(Resource.String.Lbl_ThereNoUserForThisCode), ToastLength.Short);
                AndHUD.Shared.Dismiss();
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

    }
}