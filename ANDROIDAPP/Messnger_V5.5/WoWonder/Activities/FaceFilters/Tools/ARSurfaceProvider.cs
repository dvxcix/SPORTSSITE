using AI.Deepar.AR;
using Android.App;
using Android.Content;
using Android.Graphics;
using Android.Opengl;
using Android.Util;
using Android.Views;
using AndroidX.Camera.Core;
using AndroidX.Core.Content;
using AndroidX.Core.Util;
using Java.Util;
using System;
using WoWonder.Helpers.Utils;
using Exception = System.Exception;
using Object = Java.Lang.Object;

namespace WoWonder.Activities.FaceFilters.Tools
{
    public class ArSurfaceProvider : Object, Preview.ISurfaceProvider, SurfaceRequest.ITransformationInfoListener, IConsumer
    {
        private static readonly string Tag = "ARSurfaceProvider";

        private bool IsNotifyDeepar = true;
        private bool StopConflict = false;
        private bool Mirror = true;
        private int Orientation = 0;

        private SurfaceTexture SurfaceTexture;
        private Surface Surface;
        private int NativeGlTextureHandle = 0;

        private readonly DeepAR DeepAr;
        private readonly Context Context;

        public ArSurfaceProvider(Context context, DeepAR deepAr)
        {
            try
            {
                Context = context;
                DeepAr = deepAr;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void PrintEglState()
        {
            try
            {
                Console.WriteLine("display: " + EGL14.EglGetCurrentDisplay()!.NativeHandle + ", context: " + EGL14.EglGetCurrentContext()!.NativeHandle);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnSurfaceRequested(SurfaceRequest request)
        {
            try
            {
                Log.Debug(Tag, "Surface requested");
                PrintEglState();

                // request the external gl texture from deepar
                if (NativeGlTextureHandle == 0)
                {
                    NativeGlTextureHandle = DeepAr.ExternalGlTexture;
                    Log.Debug(Tag, "request new external GL texture");
                    PrintEglState();
                }

                // if external gl texture could not be provided
                if (NativeGlTextureHandle == 0)
                {
                    request.WillNotProvideSurface();
                    return;
                }

                // if external GL texture is provided create SurfaceTexture from it
                // and register onFrameAvailable listener to
                Size resolution = request.Resolution;
                if (SurfaceTexture == null)
                {
                    SurfaceTexture = new SurfaceTexture(NativeGlTextureHandle);
                    SurfaceTexture.SetOnFrameAvailableListener(new MyOnFrameAvailable(this, resolution));
                }
                SurfaceTexture.SetDefaultBufferSize(resolution.Width, resolution.Height);

                if (Surface == null)
                {
                    Surface = new Surface(SurfaceTexture);
                }

                // register transformation listener to listen for screen orientation changes
                request.SetTransformationInfoListener(ContextCompat.GetMainExecutor(Context), this);
                request.ProvideSurface(Surface, ContextCompat.GetMainExecutor(Context), this);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private class MyOnFrameAvailable : Object, SurfaceTexture.IOnFrameAvailableListener
        {
            private readonly ArSurfaceProvider ArSurfaceProvider;
            private readonly Size Resolution;
            public MyOnFrameAvailable(ArSurfaceProvider arSurfaceProvider, Size resolution)
            {
                ArSurfaceProvider = arSurfaceProvider;
                Resolution = resolution;
            }

            public void OnFrameAvailable(SurfaceTexture surfaceTexture)
            {
                try
                {
                    if (ArSurfaceProvider.StopConflict)
                    {
                        return;
                    }
                    surfaceTexture.UpdateTexImage();
                    if (ArSurfaceProvider.IsNotifyDeepar)
                    {
                        ArSurfaceProvider.DeepAr.ReceiveFrameExternalTexture(Resolution.Width, Resolution.Height, ArSurfaceProvider.Orientation, ArSurfaceProvider.Mirror, ArSurfaceProvider.NativeGlTextureHandle);
                    }
                }
                catch (Exception e)
                {
                    Methods.DisplayReportResultTrack(e);
                }
            }
        }

        public void OnTransformationInfoUpdate(SurfaceRequest.TransformationInfo transformationInfo)
        {
            try
            {
                Orientation = transformationInfo.RotationDegrees;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void Accept(Object t)
        {
            try
            {

            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public bool IsMirror()
        {
            return Mirror;
        }

        public void SetMirror(bool mirror)
        {
            try
            {
                Mirror = mirror;
                if (SurfaceTexture == null || Surface == null)
                {
                    return;
                }

                // when camera changes from front to back, we don't know
                // when exactly it will happen so we pause feeding the frames
                // to deepar for 1 second to avoid mirroring image before
                // the camera actually changed
                IsNotifyDeepar = false;
                new Timer().Schedule(new MyTimerTask(this), 1000);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private class MyTimerTask : TimerTask
        {
            private readonly ArSurfaceProvider ArSurfaceProvider;
            public MyTimerTask(ArSurfaceProvider arSurfaceProvider)
            {
                ArSurfaceProvider = arSurfaceProvider;
            }

            public override void Run()
            {
                try
                {
                    ArSurfaceProvider.IsNotifyDeepar = true;
                }
                catch (Exception e)
                {
                    Methods.DisplayReportResultTrack(e);
                }
            }
        }

        /// <summary>
        /// Tell the surface provider to stop feeding frames to DeepAR.
        /// Should be called in <seealso cref="Activity.OnDestroy()"/> ()}.
        /// </summary>
        public void Stop()
        {
            StopConflict = true;
        }

    }
}
