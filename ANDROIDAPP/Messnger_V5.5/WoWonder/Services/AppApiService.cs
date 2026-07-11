using Android.App;
using Android.App.Job;
using Android.Content;
using Android.Content.PM;
using Android.OS;
using AndroidX.Core.App;
using Java.Lang;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using WoWonder.Activities.Tab;
using WoWonder.Activities.Tab.Fragment;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Model;
using WoWonder.Helpers.Utils;
using WoWonder.SocketSystem;
using WoWonder.SQLite;
using WoWonderClient;
using WoWonderClient.Classes.Message;
using WoWonderClient.Requests;
using Exception = Java.Lang.Exception;

namespace WoWonder.Services
{
    [Service(Exported = true, ForegroundServiceType = ForegroundService.TypeRemoteMessaging, Permission = "android.permission.BIND_JOB_SERVICE")]
    public class AppApiService : JobService
    {
        private static AppApiService Instance;

        private static readonly int NotificationId = 32;
        private static readonly string ChannelId = "ForegroundServiceChannel";
        private NotificationCompat.Builder Notification;
        private NotificationManager MNotificationManager;

        public AppApiService()
        {
            Instance = this;
        }

        public static AppApiService GetInstance()
        {
            if (Instance == null)
            {
                Instance = new AppApiService();
            }
            return Instance;
        }

        public override void OnCreate()
        {
            try
            {
                base.OnCreate();

                MNotificationManager = (NotificationManager)GetSystemService(NotificationService);
                BuildNotification();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override StartCommandResult OnStartCommand(Intent intent, StartCommandFlags flags, int startId)
        {
            try
            {
                base.OnStartCommand(intent, flags, startId);

                // Perform your background task here
                ThreadPool.RunOnUiThread(new AppUpdaterHelper(Application.Context));

                CreateNotificationChannel();

                return StartCommandResult.Sticky;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return StartCommandResult.NotSticky;
            }
        }

        public override bool OnStartJob(JobParameters jobParams)
        {
            //Toast.MakeText(Application.Context, "On Start Job " + Methods.AppLifecycleObserver.AppState, ToastLength.Short)?.Show();

            // Perform your background task here
            ThreadPool.RunOnUiThread(new AppUpdaterHelper(Application.Context));

            // IMPORTANT: Call jobFinished() when your background task is complete
            JobFinished(jobParams, true);

            // Our task will run in background, we will take care of notifying the finish.
            return true;
        }

        public override bool OnStopJob(JobParameters jobParams)
        {
            //Toast.MakeText(Application.Context, "On Stop Job 321" + Methods.AppLifecycleObserver.AppState, ToastLength.Short)?.Show();
            // I want it to reschedule so returned true, if we would have returned false, then job would have ended here.
            // It would not fire onStartJob() when constraints are re satisfied.

            return true;
        }

        private void CreateNotificationChannel()
        {
            try
            {
                if (Notification == null)
                    BuildNotification();

                MNotificationManager.Notify(NotificationId, Notification?.Build());

                if (Build.VERSION.SdkInt >= BuildVersionCodes.R)
                {
                    StartForeground(NotificationId, Notification?.Build(), ForegroundService.TypeRemoteMessaging);
                }
                else
                {
                    StartForeground(NotificationId, Notification?.Build());
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void BuildNotification()
        {
            try
            {
                Intent notificationIntent = new Intent(this, typeof(ChatTabbedMainActivity));
                PendingIntent contentIntent = PendingIntent.GetService(this, 0, notificationIntent, PendingIntentFlags.Immutable);

                Notification = new NotificationCompat.Builder(this, ChannelId)
                    //.SetContentTitle("Foreground Service")
                    //.SetContentText("Running in the background")
                    .SetPriority((int)NotificationPriority.Low)
                    .SetCategory(NotificationPriorityCategory.Alarms.ToString())
                    .SetContentIntent(contentIntent)
                    .SetSmallIcon(Resource.Mipmap.icon)
                    .SetChannelId(ChannelId);

                if (Build.VERSION.SdkInt >= BuildVersionCodes.O)
                {
                    NotificationImportance importance = NotificationImportance.Low;
                    NotificationChannel mChannel = new NotificationChannel(ChannelId, AppSettings.ApplicationName, importance);
                    MNotificationManager.CreateNotificationChannel(mChannel);
                }
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
            }
        }

        public void StartForegroundService(Context context)
        {
            try
            {
                Intent serviceIntent = new Intent(context, typeof(AppApiService));
                serviceIntent.PutExtra("inputExtra", "Foreground Service");
                context.StartService(serviceIntent);

                ScheduleJob(context);
            }
            catch (ForegroundServiceStartNotAllowedException e)
            {
                Methods.DisplayReportResultTrack(e);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void ScheduleJob(Context context)
        {
            try
            {
                ComponentName serviceComponent = new ComponentName(context, Class.FromType(typeof(AppApiService)));

                //JobScheduler js = (JobScheduler)context.GetSystemService(Context.JobSchedulerService);
                //JobInfo.Builder builder = new JobInfo.Builder(0, serviceComponent);
                //builder.AddTriggerContentUri(new JobInfo.TriggerContentUri(MediaStore.Images.Media.ExternalContentUri, TriggerContentUriFlags.NotifyForDescendants));
                //js.Schedule(builder.Build());

                JobInfo jobInfo;
                if (Build.VERSION.SdkInt >= BuildVersionCodes.N)
                {
                    JobInfo.Builder builder = new JobInfo.Builder(1021, serviceComponent);

                    // Set the job parameters
                    builder.SetRequiredNetworkType(NetworkType.Any);  // Requires network connectivity
                    //builder.SetRequiresCharging(false);  // Requires device to be charging
                    // builder.SetPeriodic(15 * 60 * 1000, 60 * 1000);  // Repeat every 15 minutes
                    builder.SetMinimumLatency(3600000);  //5 * 1000 Minimum latency of 5 minutes
                    //builder.SetRequiresDeviceIdle(false);  // the device should be idle

                    //builder.SetPersisted(true);  // Keep the job after a device reboot
                    jobInfo = builder?.Build();
                }
                else
                {
                    jobInfo = new JobInfo.Builder(1021, serviceComponent)?.SetPeriodic(3600000)?.Build();
                }

                var jobScheduler = (JobScheduler)context.GetSystemService(Context.JobSchedulerService);
                if (jobInfo != null)
                {
                    var resultCode = jobScheduler?.Schedule(jobInfo);
                    if (resultCode == JobScheduler.ResultSuccess)
                    {
                        Console.WriteLine("MyJobService scheduled!");
                    }
                    else
                    {
                        Console.WriteLine("MyJobService not scheduled!");
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void StopJob(Context context)
        {
            try
            {
                var jobScheduler = (JobScheduler)context.GetSystemService(Context.JobSchedulerService);
                jobScheduler?.CancelAll();

                // Stop and close the foreground service
                StopForeground(StopForegroundFlags.Remove);

                StopSelf();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }

    public class AppUpdaterHelper : Java.Lang.Object, IRunnable
    {
        private static Context Context;

        public AppUpdaterHelper(Context context)
        {
            Context = context;
        }

        public void Run()
        {
            try
            {
                if (string.IsNullOrEmpty(Methods.AppLifecycleObserver.AppState))
                    Methods.AppLifecycleObserver.AppState = "Background";

                //ToastUtils.ShowToast(Context, "AppState " + Methods.AppLifecycleObserver.AppState, ToastLength.Short);

                if (string.IsNullOrEmpty(InitializeWoWonder.WebsiteUrl))
                {
                    InitializeWoWonder.Initialize(AppSettings.TripleDesAppServiceProvider, Context.PackageName, AppSettings.TurnTrustFailureOnWebException, MyReportModeApp.CreateInstance());
                    var sqLiteDatabase = new SqLiteDatabase();
                    sqLiteDatabase.CheckTablesStatus();
                }

                if (Methods.AppLifecycleObserver.AppState == "Background" || string.IsNullOrEmpty(Current.AccessToken))
                {
                    SqLiteDatabase dbDatabase = new SqLiteDatabase();
                    var login = dbDatabase.Get_data_Login_Credentials();
                    Console.WriteLine(login);
                }

                if (string.IsNullOrEmpty(Current.AccessToken))
                    return;

                if (AppSettings.ConnectionTypeChat == InitializeWoWonder.ConnectionType.Socket)
                {
                    if (UserDetails.Socket == null)
                    {
                        UserDetails.Socket = new WoSocketHandler();
                        UserDetails.Socket?.InitStart();

                        //Connect to socket with access token
                        UserDetails.Socket?.Emit_Join(UserDetails.Username, UserDetails.AccessToken);
                    }
                    else
                    {
                        if (UserDetails.Socket.Client is { Connected: false } || !WoSocketHandler.IsJoined)
                        {
                            //Connect to socket with access token
                            UserDetails.Socket?.Emit_Join(UserDetails.Username, UserDetails.AccessToken);
                        }
                    }

                    //ToastUtils.ShowToast(Context, "Socket Client is " + UserDetails.Socket?.Client?.Connected  , ToastLength.Short);
                }
                else
                {
                    if (Methods.CheckConnectivity())
                        PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => LoadChatAsync() }, 0);
                }

                //if (Methods.CheckConnectivity())
                //{
                //    var instance = ChatTabbedMainActivity.GetInstance();
                //    if (Methods.AppLifecycleObserver.AppState == "Foreground" && instance != null)
                //    {
                //        //if (instance.NewsFeedTab != null) PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => instance.NewsFeedTab.LoadStory() });
                //    }
                //} 

                ThreadPool.RunOnUiThread(this);
            }
            catch (Exception e)
            {
                ThreadPool.RunOnUiThread(this);

                //ToastUtils.ShowToast(Context, "ResultSender failed",ToastLength.Short); 
                Methods.DisplayReportResultTrack(e);
            }
        }

        public static async Task LoadChatAsync(bool check = false)
        {
            try
            {
                if (LastChatFragment.ApiRun)
                    return;

                //ToastUtils.ShowToast(Context, "LoadChatAsync", ToastLength.Short);

                LastChatFragment.ApiRun = true;

                var fetch = "users";

                if (AppSettings.EnableChatPage)
                    fetch += ",pages";

                string limit = "5";
                if (check)
                {
                    fetch = "users";
                    limit = "1";
                }

                bool onlineUsers = UserDetails.OnlineUsers;
                if (Methods.AppLifecycleObserver.AppState == "Background")
                    onlineUsers = false;

                var (apiStatus, respond) = await RequestsAsync.Message.GetChatAsync(fetch, "", "0", "0", "0", limit, onlineUsers);
                if (apiStatus != 200 || respond is not LastChatObject result || result.Data == null)
                {
                    LastChatFragment.ApiRun = false;
                    //Methods.DisplayReportResult(new Activity(), respond);
                }
                else
                {
                    LastChatFragment.LoadCall(Context, result);

                    var respondList = result.Data.Count;
                    if (respondList > 0)
                    {
                        if (Methods.AppLifecycleObserver.AppState == "Foreground")
                        {
                            var instance = ChatTabbedMainActivity.GetInstance();
                            if (instance != null)
                            {
                                instance.ChatTab?.LastChatTab?.LoadDataLastChatNewV(result.Data);
                            }
                            else
                            {
                                LastChatFragment.ApiRun = false;

                                if (check)
                                    return;

                                ListUtils.UserList = new ObservableCollection<ChatObject>(result.Data);

                                //Insert All data users to database
                                SqLiteDatabase dbDatabase = new SqLiteDatabase();
                                dbDatabase.Insert_Or_Update_LastUsersChat(Context, ListUtils.UserList, UserDetails.ChatHead);
                            }
                        }
                        else
                        {
                            LastChatFragment.ApiRun = false;

                            if (check)
                                return;

                            ListUtils.UserList = new ObservableCollection<ChatObject>(result.Data);

                            //Insert All data users to database
                            SqLiteDatabase dbDatabase = new SqLiteDatabase();
                            dbDatabase.Insert_Or_Update_LastUsersChat(Context, ListUtils.UserList, UserDetails.ChatHead);
                        }
                    }
                    else
                    {
                        LastChatFragment.ApiRun = false;
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                LastChatFragment.ApiRun = false;
            }
        }
    }

    [BroadcastReceiver(Exported = true)]
    [IntentFilter(new[] { Intent.ActionBootCompleted })]
    public class AppApiReceiver : BroadcastReceiver
    {
        public override void OnReceive(Context context, Intent intent)
        {
            try
            {
                if (intent.Action.Equals("android.intent.action.BOOT_COMPLETED") && !string.IsNullOrEmpty(UserDetails.AccessToken))
                {
                    //here we start the service  again.           
                    AppApiService.GetInstance()?.StartForegroundService(context);
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }

    public abstract class ThreadPool
    {
        private static Handler SUiThreadHandler;

        private ThreadPool()
        {
        }

        /// <summary>
        /// 
        /// </summary>
        /// <param name="runnable"></param>
        public static void RunOnUiThread(AppUpdaterHelper runnable)
        {
            try
            {
                SUiThreadHandler ??= new Handler(Looper.MainLooper);
                SUiThreadHandler.PostDelayed(runnable, 6000);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }
}