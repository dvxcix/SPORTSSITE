using AI.Deepar.AR;
using Android.Content;
using Android.Content.PM;
using Android.Util;
using Android.Views;
using AndroidX.Camera.Core;
using AndroidX.Camera.Lifecycle;
using AndroidX.Core.Content;
using AndroidX.Lifecycle;
using Google.Common.Util.Concurrent;
using Java.Lang;
using Java.Nio;
using WoWonder.Helpers.Utils;
using Exception = System.Exception;
using Object = Java.Lang.Object;

namespace WoWonder.Activities.FaceFilters.Tools
{
    public class CameraGrabber
    {
        private static readonly string Tag = nameof(CameraGrabber);
        private readonly Context Context;
        private ProcessCameraProvider CameraProvider;
        private ICameraGrabberListener Listener;
        private CameraSelector CameraSelector;
        private ImageAnalysis ImageAnalysis;
        private DeepAR FrameReceiver;
        private int CurrentLensFacing = CameraSelector.LensFacingFront; // Default to Front

        private ArSurfaceProvider SurfaceProvider;
        private int CurrentBuffer = 0;
        private ByteBuffer[] Buffers;
        private static readonly int NumberOfBuffers = 2;

        private ICamera Camera;

        public CameraGrabber(Context context, DeepAR deepAr)
        {
            try
            {
                Context = context;
                FrameReceiver = deepAr;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void InitCamera(ICameraGrabberListener listener)
        {
            try
            {
                Listener = listener;
                IListenableFuture cameraProviderFuture = ProcessCameraProvider.GetInstance(Context);
                cameraProviderFuture.AddListener(new Runnable(() =>
                {
                    try
                    {
                        var cameraProvider = cameraProviderFuture.Get();
                        if (cameraProvider is ProcessCameraProvider camera)
                        {
                            CameraProvider = camera;
                            SetupCamera();
                        }
                    }
                    catch (Exception e)
                    {
                        Log.Error(Tag, "Camera initialization failed: " + e.Message);
                        listener?.OnCameraError(e.Message);
                    }
                }), ContextCompat.GetMainExecutor(Context));
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
                // Available 1080p, 720p and 480p resolutions
                CameraResolutionPreset cameraPreset = CameraResolutionPreset.P1280x720;
                int width;
                int height;
                var orientation = GetScreenOrientation();

                if (orientation == ScreenOrientation.ReverseLandscape || orientation == ScreenOrientation.Landscape)
                {
                    width = cameraPreset.Width;
                    height = cameraPreset.Height;
                }
                else
                {
                    width = cameraPreset.Height;
                    height = cameraPreset.Width;
                }

                Size cameraResolution = new Size(width, height);

                CameraProvider?.UnbindAll();

                CameraSelector = new CameraSelector.Builder()
                    .RequireLensFacing(CurrentLensFacing)
                    .Build();

                Preview preview = new Preview.Builder()
                    .SetTargetResolution(cameraResolution)
                    .Build();

                if (SurfaceProvider == null)
                {
                    SurfaceProvider = new ArSurfaceProvider(Context, FrameReceiver);
                }

                preview.SetSurfaceProvider(SurfaceProvider);
                SurfaceProvider.SetMirror(CameraSelector.LensFacing == (Integer)CameraSelector.LensFacingFront);

                Buffers = new ByteBuffer[NumberOfBuffers];
                for (int i = 0; i < NumberOfBuffers; i++)
                {
                    Buffers[i] = ByteBuffer.AllocateDirect(width * height * 4);
                    Buffers[i].Order(ByteOrder.NativeOrder());
                    Buffers[i].Position(0);
                }

                ImageAnalysis = new ImageAnalysis.Builder()
                    .SetOutputImageFormat(ImageAnalysis.OutputImageFormatRgba8888)
                    .SetTargetResolution(cameraResolution)
                    .SetBackpressureStrategy(ImageAnalysis.StrategyKeepOnlyLatest)
                    .Build();

                ImageAnalysis.SetAnalyzer(ContextCompat.GetMainExecutor(Context), new MyImageAnalyzer2(this));

                Camera = CameraProvider.BindToLifecycle((ILifecycleOwner)Context, CameraSelector, ImageAnalysis);

                Listener?.OnCameraInitialized();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private class MyImageAnalyzer2 : Object, ImageAnalysis.IAnalyzer
        {
            private readonly CameraGrabber Instance;
            public MyImageAnalyzer2(CameraGrabber instance)
            {
                Instance = instance;
            }

            public void Analyze(IImageProxy image)
            {
                try
                {
                    Instance.ProcessFrame(image);
                    image.Close();
                }
                catch (Exception e)
                {
                    Methods.DisplayReportResultTrack(e);
                }
            }
        }

        private ScreenOrientation GetScreenOrientation()
        {
            try
            {
                var rotation = ((Android.App.Activity)Context).WindowManager.DefaultDisplay.Rotation;

                var width = Context.Resources.DisplayMetrics.WidthPixels;
                var height = Context.Resources.DisplayMetrics.HeightPixels;

                ScreenOrientation orientation = ScreenOrientation.Portrait;
                // if the device's natural orientation is portrait:
                if ((rotation == SurfaceOrientation.Rotation0 || rotation == SurfaceOrientation.Rotation180) && height > width ||
                    (rotation == SurfaceOrientation.Rotation90 || rotation == SurfaceOrientation.Rotation270) && width > height)
                {
                    switch (rotation)
                    {
                        case SurfaceOrientation.Rotation0:
                            orientation = ScreenOrientation.Portrait;
                            break;
                        case SurfaceOrientation.Rotation90:
                            orientation = ScreenOrientation.Landscape;
                            break;
                        case SurfaceOrientation.Rotation180:
                            orientation = ScreenOrientation.ReversePortrait;
                            break;
                        case SurfaceOrientation.Rotation270:
                            orientation = ScreenOrientation.ReverseLandscape;
                            break;
                        default:
                            orientation = ScreenOrientation.Portrait;
                            break;
                    }
                }
                else
                {
                    switch (rotation)
                    {
                        case SurfaceOrientation.Rotation0:
                            orientation = ScreenOrientation.Landscape;
                            break;
                        case SurfaceOrientation.Rotation90:
                            orientation = ScreenOrientation.Portrait;
                            break;
                        case SurfaceOrientation.Rotation180:
                            orientation =
                                ScreenOrientation.ReverseLandscape;
                            break;
                        case SurfaceOrientation.Rotation270:
                            orientation =
                                ScreenOrientation.ReversePortrait;
                            break;
                        default:
                            orientation = ScreenOrientation.Landscape;
                            break;
                    }
                }
                return orientation;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return ScreenOrientation.Portrait;
            }
        }

        private void ProcessFrame(IImageProxy image)
        {
            try
            {
                if (FrameReceiver == null) return;

                ByteBuffer buffer = image.GetPlanes()[0].Buffer;
                buffer.Rewind();
                Buffers[CurrentBuffer].Put(buffer);
                Buffers[CurrentBuffer].Position(0);

                var data = Buffers[CurrentBuffer];
                FrameReceiver.ReceiveFrame(
                    data,
                    image.Width,
                    image.Height,
                    image.ImageInfo.RotationDegrees,
                    CameraSelector.LensFacing == (Integer)CameraSelector.LensFacingFront,
                    DeepARImageFormat.Rgba8888,
                    image.GetPlanes()[0].PixelStride
                );

                CurrentBuffer = (CurrentBuffer + 1) % NumberOfBuffers;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void StartPreview()
        {
            try
            {
                InitCamera(Listener);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void StopPreview()
        {
            try
            {
                CameraProvider?.UnbindAll();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void ReleaseCamera()
        {
            try
            {
                StopPreview();
                FrameReceiver = null;
                Camera = null;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void ChangeCameraDevice()
        {
            try
            {
                CurrentLensFacing = (CurrentLensFacing == CameraSelector.LensFacingFront)
                    ? CameraSelector.LensFacingBack
                    : CameraSelector.LensFacingFront;

                SetupCamera();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public int GetCurrentCameraSelector()
        {
            return CurrentLensFacing == CameraSelector.LensFacingFront ? CameraSelector.LensFacingFront : CameraSelector.LensFacingBack;
        }

        public ICamera GetCurrentCamera()
        {
            return Camera;
        }

        public void SetFrameReceiver(DeepAR receiver)
        {
            FrameReceiver = receiver;
        }
    }
}
