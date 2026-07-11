using Android.Content;
using Android.OS;
using Android.Runtime;
using Android.Util;
using Android.Views;
using Android.Widget;
using AT.Markushi.UI;
using Java.Lang;
using System;
using WoWonder.Helpers.Utils;
using Exception = System.Exception;
using Math = System.Math;

namespace WoWonder.Library.Anjo.Video
{
    public class CameraButton : CircleButton, View.IOnTouchListener
    {
        public interface ICameraActionListener
        {
            void OnStartRecord();
            void OnEndRecord();
            void OnDurationTooShortError();
            void OnSingleTap();
            void OnCancelled();
        }

        private ProgressBar ProgressBar;

        private ICameraActionListener ActionListener;
        private bool EnableVideoRecording = true;
        private bool EnablePhotoTaking = true;
        private bool IsRecording = true;
        private long StartRecordTime = 0;
        private long EndRecordTime = 0;
        private long VideoDurationInMillis = VideoDuration;

        private static readonly long MinimumVideoDurationMillis = 300L;
        private static readonly long VideoDuration = 60000L;

        private readonly Handler TimerHandler = new Handler(Looper.MainLooper);
        private Runnable StopRecordingRunnable;
        private Runnable ProgressUpdater;
        private Runnable LongPressRunnable;
        private int Progress = 0;

        protected CameraButton(IntPtr javaReference, JniHandleOwnership transfer) : base(javaReference, transfer)
        {
        }

        public CameraButton(Context p0, IAttributeSet p1, int p2) : base(p0, p1, p2)
        {
            Init();
        }

        public CameraButton(Context p0, IAttributeSet p1) : base(p0, p1)
        {
            Init();
        }

        public CameraButton(Context p0) : base(p0)
        {
            Init();
        }

        private void Init()
        {
            try
            {
                SetOnTouchListener(this);

                // Runnable to update ProgressBar
                ProgressUpdater = new Runnable(() =>
                {
                    try
                    {
                        if (Progress < 100)
                        {
                            Progress += 100 / 60; // Increase progress gradually

                            if (Build.VERSION.SdkInt >= BuildVersionCodes.N)
                                ProgressBar.SetProgress(Progress, true);
                            else // For API < 24 
                                ProgressBar.Progress = Progress;
                            TimerHandler.PostDelayed(ProgressUpdater, 1000); // Update every second
                        }
                    }
                    catch (Exception e)
                    {
                        Console.WriteLine(e);
                    }
                });

                LongPressRunnable = new Runnable(() =>
                {
                    try
                    {
                        isLongPress = true;

                        //Long Click Event
                        if (EnableVideoRecording)
                            OnLongPressStart();
                    }
                    catch (Exception e)
                    {
                        Console.WriteLine(e);
                    }
                });
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
            }
        }

        public void SetActionListener(ICameraActionListener listener)
        {
            ActionListener = listener;
        }

        public void SetVideoDuration(long durationInMillis)
        {
            VideoDurationInMillis = durationInMillis;
        }

        public void SetProgressBar(ProgressBar progressBar)
        {
            ProgressBar = progressBar;
        }

        public void SetEnableVideoRecording(bool enable)
        {
            EnableVideoRecording = enable;
        }

        public void SetEnablePhotoTaking(bool enable)
        {
            EnablePhotoTaking = enable;
        }

        private bool isLongPress = false; // Flag to detect long press
        private bool isMoving = false;    // Flag to detect move action
        private float startX, startY;        // Track initial touch position
        private Handler handler = new Handler(Looper.MainLooper);
        public bool OnTouch(View v, MotionEvent e)
        {
            try
            {
                if (e.Action == MotionEventActions.Down)
                {
                    isLongPress = false;
                    isMoving = false;
                    startX = e.GetX();
                    startY = e.GetY();
                    handler.PostDelayed(LongPressRunnable, 500); // 500ms for long press
                    return true;
                }
                else if (e.Action == MotionEventActions.Move)
                {
                    float deltaX = e.GetX() - startX;
                    float deltaY = e.GetY() - startY;

                    if (Math.Abs(deltaX) > 20 || Math.Abs(deltaY) > 20)
                    { // Move threshold
                        isMoving = true;
                        // handler.RemoveCallbacks(longPressRunnable); // Cancel long press
                        //Move Event

                    }
                    return true;
                }
                else if (e.Action == MotionEventActions.Up)
                {
                    handler.RemoveCallbacks(LongPressRunnable);
                    if (!isLongPress && !isMoving)
                    {
                        // Single Click Detected
                        if (EnablePhotoTaking && ActionListener != null)
                            ActionListener.OnSingleTap();
                    }
                    else
                    {
                        // Long Click Detected
                        if (EnableVideoRecording)
                            return OnLongPressEnd();
                    }
                    return true;
                }

                return false;
            }
            catch (Exception exception)
            {
                Console.WriteLine(exception);
                return false;
            }
        }

        private void OnLongPressStart()
        {
            try
            {
                IsRecording = true;
                if (ActionListener != null)
                {
                    ActionListener.OnStartRecord();
                }
                StartRecordTime = Methods.Time.CurrentTimeMillis();

                // Show ProgressBar
                ProgressBar.Visibility = ViewStates.Visible;

                if (Build.VERSION.SdkInt >= BuildVersionCodes.N)
                    ProgressBar.SetProgress(Progress, false);
                else // For API < 24 
                    ProgressBar.Progress = 0;

                Progress = 0;

                // Update ProgressBar every second
                TimerHandler.PostDelayed(ProgressUpdater, 1000);

                // Stop recording automatically after 1 minute (60,000 milliseconds)
                StopRecordingRunnable = new Runnable(() => OnLongPressEnd());
                TimerHandler.PostDelayed(StopRecordingRunnable, VideoDurationInMillis); // 1 min timer
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private bool OnLongPressEnd()
        {
            try
            {
                if (!IsRecording)
                {
                    return false;
                }

                IsRecording = false;
                EndRecordTime = Methods.Time.CurrentTimeMillis();

                // Remove the scheduled stop if the user stops manually
                TimerHandler.RemoveCallbacks(StopRecordingRunnable);
                TimerHandler.RemoveCallbacks(ProgressUpdater);

                // Hide ProgressBar
                ProgressBar.Visibility = ViewStates.Gone;

                if (Build.VERSION.SdkInt >= BuildVersionCodes.N)
                    ProgressBar.SetProgress(Progress, false);
                else // For API < 24 
                    ProgressBar.Progress = 0;

                Progress = 0;

                if (IsRecordTooShort(StartRecordTime, EndRecordTime, MinimumVideoDurationMillis))
                {
                    if (ActionListener != null)
                    {
                        ActionListener.OnDurationTooShortError();
                    }
                }
                else if (ActionListener != null)
                {
                    ActionListener.OnEndRecord();
                }

                ResetRecordingValues();

                return true;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return false;
            }
        }

        public void CancelRecording()
        {
            try
            {
                if (!IsRecording)
                {
                    return;
                }

                IsRecording = false;
                EndRecordTime = Methods.Time.CurrentTimeMillis();

                ActionListener?.OnCancelled();

                ResetRecordingValues();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void ResetRecordingValues()
        {
            StartRecordTime = 0;
            EndRecordTime = 0;
        }

        private bool IsRecordTooShort(long startMillis, long endMillis, long minimumMillisRange)
        {
            return endMillis - startMillis < minimumMillisRange;
        }
    }
}
