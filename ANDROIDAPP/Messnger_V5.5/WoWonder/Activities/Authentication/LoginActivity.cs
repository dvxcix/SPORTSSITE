using Android;
using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.Gms.Common.Util.Concurrent;
using Android.OS;
using Android.Views;
using Android.Widget;
using AndroidX.AppCompat.Widget;
using AndroidX.Core.App;
using AndroidX.Core.Content;
using AndroidX.Credentials;
using Com.Facebook;
using Com.Facebook.Login;
using Google.Android.Material.Dialog;
using Java.Util.Concurrent;
using Org.Json;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using WoWonder.Activities.Base;
using WoWonder.Activities.Tab;
using WoWonder.Activities.WalkTroutPage;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Model;
using WoWonder.Helpers.SocialLogins;
using WoWonder.Helpers.Utils;
using WoWonder.Library.OneSignalNotif;
using WoWonder.SQLite;
using WoWonderClient;
using WoWonderClient.Classes.Auth;
using WoWonderClient.Classes.Global;
using WoWonderClient.Requests;
using Xamarin.GoogleAndroid.Libraries.Identity.GoogleId;
using Exception = System.Exception;
using Object = Java.Lang.Object;
using Task = System.Threading.Tasks.Task;

namespace WoWonder.Activities.Authentication
{
    [Activity(Icon = "@mipmap/icon", Theme = "@style/MyTheme", ConfigurationChanges = ConfigChanges.Locale | ConfigChanges.UiMode | ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize)]
    public class LoginActivity : BaseActivity, IFacebookCallback, GraphRequest.IGraphJSONObjectCallback, ICredentialManagerCallback
    {
        #region Variables Basic

        private LinearLayout RegisterButton;
        private AppCompatButton MButtonViewSignIn;
        private EditText UsernameEditText, PasswordEditText;
        private LinearLayout FbLoginButton, GoogleSignInButton;
        private TextView TopTittle, ForgetPass;
        private ProgressBar ProgressBar;
        private ICallbackManager MFbCallManager;
        private FbMyProfileTracker ProfileTracker;
        public static ICredentialManager CredentialManager;
        private ImageView EyesIcon;
        private string TimeZone = AppSettings.CodeTimeZone;
        private bool IsActiveUser = true;

        #endregion

        #region General

        protected override void OnCreate(Bundle savedInstanceState)
        {
            try
            {
                base.OnCreate(savedInstanceState);

                InitializeWoWonder.Initialize(AppSettings.TripleDesAppServiceProvider, PackageName, AppSettings.TurnTrustFailureOnWebException, MyReportModeApp.CreateInstance());

                SetTheme(WoWonderTools.IsTabDark() ? Resource.Style.MyTheme_Dark : Resource.Style.MyTheme);
                Methods.App.FullScreenApp(this);

                // Create your application here
                SetContentView(Resource.Layout.LoginLayout);

                //Get Value And Set Toolbar
                InitComponent();
                InitSocialLogins();
                InitBackPressed();

                //OneSignal Notification  
                //====================================== 
                if (Build.VERSION.SdkInt >= BuildVersionCodes.Tiramisu)
                {
                    if (ContextCompat.CheckSelfPermission(this, Manifest.Permission.PostNotifications) == Permission.Granted)
                    {
                        if (string.IsNullOrEmpty(UserDetails.DeviceId))
                            OneSignalNotification.Instance.RegisterNotificationDevice(this);
                    }
                    else
                    {
                        ActivityCompat.RequestPermissions(this, new[]
                        {
                            Manifest.Permission.PostNotifications
                        }, 16248);
                    }
                }
                else
                {
                    if (string.IsNullOrEmpty(UserDetails.DeviceId))
                        OneSignalNotification.Instance.RegisterNotificationDevice(this);
                }

                if (AppSettings.EnableSmartLockForPasswords)
                    BuildClients(null);
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

                if (Methods.CheckConnectivity())
                    PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => ApiRequest.GetSettings_Api(this), GetTimezone });
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
                ProfileTracker?.StopTracking();

                base.OnDestroy();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Functions

        private void InitComponent()
        {
            try
            {
                //Get values 
                UsernameEditText = FindViewById<EditText>(Resource.Id.usernamefield);
                PasswordEditText = FindViewById<EditText>(Resource.Id.passwordfield);
                ProgressBar = FindViewById<ProgressBar>(Resource.Id.progressBar);

                EyesIcon = FindViewById<ImageView>(Resource.Id.imageShowPass);
                EyesIcon.Click += EyesIconOnClick;
                EyesIcon.Tag = "hide";

                MButtonViewSignIn = FindViewById<AppCompatButton>(Resource.Id.loginButton);
                RegisterButton = FindViewById<LinearLayout>(Resource.Id.SignLayout);

                TopTittle = FindViewById<TextView>(Resource.Id.titile);
                TopTittle.Text = GetText(Resource.String.Lbl_LoginTo) + " " + AppSettings.ApplicationName;

                ForgetPass = FindViewById<TextView>(Resource.Id.forgetpassButton);

                ProgressBar.Visibility = ViewStates.Invisible;

                if (!AppSettings.EnableRegisterSystem)
                    RegisterButton.Visibility = ViewStates.Gone;
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
                    ForgetPass.Click += ForgetPassOnClick;
                    RegisterButton.Click += RegisterButton_Click;
                    MButtonViewSignIn.Click += BtnLoginOnClick;

                }
                else
                {
                    //Close Event
                    ForgetPass.Click -= ForgetPassOnClick;
                    RegisterButton.Click -= RegisterButton_Click;
                    MButtonViewSignIn.Click -= BtnLoginOnClick;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void InitSocialLogins()
        {
            try
            {
                //#Facebook
                if (AppSettings.ShowFacebookLogin)
                {
                    //FacebookSdk.SdkInitialize(this); 
                    //LoginButton loginButton = new LoginButton(this);
                    ProfileTracker = new FbMyProfileTracker();
                    ProfileTracker.StartTracking();

                    FbLoginButton = FindViewById<LinearLayout>(Resource.Id.ll_fblogin);
                    FbLoginButton.Visibility = ViewStates.Visible;
                    FbLoginButton.Click += FbLoginButtonOnClick;

                    ProfileTracker.MOnProfileChanged += ProfileTrackerOnMOnProfileChanged;
                    //loginButton.SetPermissions(new string[]
                    //{
                    //    "email",
                    //    "public_profile"
                    //});

                    MFbCallManager = ICallbackManager.Factory.Create();
                    LoginManager.Instance.RegisterCallback(MFbCallManager, this);

                    //FB accessToken
                    var accessToken = AccessToken.CurrentAccessToken;
                    var isLoggedIn = accessToken != null && !accessToken.IsExpired;
                    if (isLoggedIn && Profile.CurrentProfile != null)
                    {
                        LoginManager.Instance.LogOut();
                    }

                    string hash = Methods.App.GetKeyHashesConfigured(this);
                    Console.WriteLine(hash);
                }
                else
                {
                    FbLoginButton = FindViewById<LinearLayout>(Resource.Id.ll_fblogin);
                    FbLoginButton.Visibility = ViewStates.Gone;
                }

                //#Google
                if (AppSettings.ShowGoogleLogin)
                {
                    GoogleSignInButton = FindViewById<LinearLayout>(Resource.Id.ll_Googlelogin);
                    GoogleSignInButton.Click += GoogleSignInButtonOnClick;
                }
                else
                {
                    GoogleSignInButton = FindViewById<LinearLayout>(Resource.Id.ll_Googlelogin);
                    GoogleSignInButton.Visibility = ViewStates.Gone;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void FbLoginButtonOnClick(object sender, EventArgs e)
        {
            try
            {
                LoginManager.Instance.LogInWithReadPermissions(this, new List<string>
                {
                    "email",
                    "public_profile"
                });
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //Login With Facebook
        private void ProfileTrackerOnMOnProfileChanged(object sender, OnProfileChangedEventArgs e)
        {
            try
            {
                if (e.MProfile != null)
                {
                    //var FbFirstName = e.MProfile.FirstName;
                    //var FbLastName = e.MProfile.LastName;
                    //var FbName = e.MProfile.Name;
                    //var FbProfileId = e.MProfile.Id;

                    var request = GraphRequest.NewMeRequest(AccessToken.CurrentAccessToken, this);
                    var parameters = new Bundle();
                    parameters.PutString("fields", "id,name,age_range,email");
                    request.Parameters = parameters;
                    request.ExecuteAndWait();
                }
            }
            catch (Exception ex)
            {
                Methods.DisplayReportResultTrack(ex);
            }
        }

        //Login With Google
        private void GoogleSignInButtonOnClick(object sender, EventArgs e)
        {
            try
            {
                GetGoogleIdOption googleIdOption = new GetGoogleIdOption.Builder()
                    .SetFilterByAuthorizedAccounts(false)
                    .SetServerClientId(AppSettings.ClientId)
                    .Build();

                GetCredentialRequest request = new GetCredentialRequest.Builder()
                    .AddCredentialOption(googleIdOption)
                    .Build();

                CancellationSignal cancellationSignal = new CancellationSignal();
                CredentialManager = ICredentialManager.Create(this);
                IExecutor executor = ContextCompat.GetMainExecutor(this);

                CredentialManager.GetCredentialAsync(this, request, cancellationSignal, executor, this);
            }
            catch (Exception ex)
            {
                Methods.DisplayReportResultTrack(ex);
            }
        }

        #endregion

        #region Events

        private void EyesIconOnClick(object sender, EventArgs e)
        {
            try
            {
                if (EyesIcon.Tag?.ToString() == "hide")
                {
                    EyesIcon.SetImageResource(Resource.Drawable.icon_eye_show_vector);
                    EyesIcon.Tag = "show";
                    PasswordEditText.InputType = Android.Text.InputTypes.TextVariationNormal | Android.Text.InputTypes.ClassText;
                    PasswordEditText.SetSelection(PasswordEditText.Text.Length);
                }
                else
                {
                    EyesIcon.SetImageResource(Resource.Drawable.icon_eye_vector);
                    EyesIcon.Tag = "hide";
                    PasswordEditText.InputType = Android.Text.InputTypes.TextVariationPassword | Android.Text.InputTypes.ClassText;
                    PasswordEditText.SetSelection(PasswordEditText.Text.Length);
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //Click Button Login
        private async void BtnLoginOnClick(object sender, EventArgs eventArgs)
        {
            try
            {
                if (!Methods.CheckConnectivity())
                {
                    Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), GetText(Resource.String.Lbl_CheckYourInternetConnection), GetText(Resource.String.Lbl_Ok));
                }
                else
                {
                    if (!string.IsNullOrEmpty(UsernameEditText.Text.Replace(" ", "")) || !string.IsNullOrEmpty(PasswordEditText.Text))
                    {
                        Methods.HideKeyboard(this);

                        ProgressBar.Visibility = ViewStates.Visible;
                        MButtonViewSignIn.Visibility = ViewStates.Gone;

                        if (string.IsNullOrEmpty(TimeZone))
                            await GetTimezone();

                        await AuthApi(UsernameEditText.Text.Replace(" ", ""), PasswordEditText.Text);
                    }
                    else
                    {
                        ProgressBar.Visibility = ViewStates.Gone;
                        MButtonViewSignIn.Visibility = ViewStates.Visible;
                        Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), GetText(Resource.String.Lbl_Please_enter_your_data), GetText(Resource.String.Lbl_Ok));
                    }
                }
            }
            catch (Exception exception)
            {
                ProgressBar.Visibility = ViewStates.Gone;
                MButtonViewSignIn.Visibility = ViewStates.Visible;
                Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), exception.Message, GetText(Resource.String.Lbl_Ok));
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private async Task AuthApi(string email, string password)
        {
            var (apiStatus, respond) = await RequestsAsync.Auth.AuthAsync(email, password, TimeZone, UserDetails.DeviceId);
            if (apiStatus == 200 && respond is AuthObject auth)
            {
                var emailValidation = ListUtils.SettingsSiteList?.EmailValidation ?? "0";
                if (emailValidation == "1")
                {
                    IsActiveUser = await CheckIsActiveUser(auth.UserId);
                }

                if (IsActiveUser)
                {
                    SetDataLogin(auth);

                    ProgressBar.Visibility = ViewStates.Gone;
                    MButtonViewSignIn.Visibility = ViewStates.Visible;

                    if (auth.IsNew != null && auth.IsNew.Value)
                    {
                        if (ListUtils.SettingsSiteList?.MembershipSystem == "1")
                        {
                            var dialogList = new MaterialAlertDialogBuilder(this);

                            dialogList.SetTitle(GetText(Resource.String.Lbl_GoPro));
                            dialogList.SetMessage(GetText(Resource.String.Lbl_AccountNeedUpgrade_Message) + " " + InitializeWoWonder.WebsiteUrl + "/go-pro");
                            dialogList.SetPositiveButton(GetText(Resource.String.Lbl_OkGo), (o, args) =>
                            {
                                try
                                {
                                    string url = InitializeWoWonder.WebsiteUrl + "/go-pro";
                                    new IntentController(this).OpenBrowserFromApp(url);
                                }
                                catch (Exception e)
                                {
                                    Methods.DisplayReportResultTrack(e);
                                }
                            });
                            dialogList.SetNegativeButton(GetText(Resource.String.Lbl_Close), new MaterialDialogUtils());
                            dialogList.Show();
                        }
                        else
                        {
                            if (AppSettings.ShowWalkTroutPage)
                            {
                                Intent newIntent = new Intent(this, typeof(WalkTroutActivity));
                                newIntent?.PutExtra("class", "login");
                                StartActivity(newIntent);
                            }
                            else
                            {
                                StartActivity(new Intent(this, typeof(ChatTabbedMainActivity)));
                            }

                            Finish();
                        }
                    }
                    else
                    {
                        if (auth.Membership != null && auth.Membership.Value)
                        {
                            var dialogList = new MaterialAlertDialogBuilder(this);

                            dialogList.SetTitle(GetText(Resource.String.Lbl_GoPro));
                            dialogList.SetMessage(GetText(Resource.String.Lbl_AccountNeedUpgrade_Message) + " " + InitializeWoWonder.WebsiteUrl + "/go-pro");
                            dialogList.SetPositiveButton(GetText(Resource.String.Lbl_OkGo), (o, args) =>
                            {
                                try
                                {
                                    string url = InitializeWoWonder.WebsiteUrl + "/go-pro";
                                    new IntentController(this).OpenBrowserFromApp(url);
                                }
                                catch (Exception e)
                                {
                                    Methods.DisplayReportResultTrack(e);
                                }
                            });
                            dialogList.SetNegativeButton(GetText(Resource.String.Lbl_Close), new MaterialDialogUtils());
                            dialogList.Show();
                        }
                        else
                        {
                            if (AppSettings.ShowWalkTroutPage)
                            {
                                Intent newIntent = new Intent(this, typeof(WalkTroutActivity));
                                newIntent?.PutExtra("class", "login");
                                StartActivity(newIntent);
                            }
                            else
                            {
                                StartActivity(new Intent(this, typeof(ChatTabbedMainActivity)));
                            }
                            Finish();
                        }
                    }
                }
                else
                {
                    ProgressBar.Visibility = ViewStates.Gone;
                    MButtonViewSignIn.Visibility = ViewStates.Visible;
                }
            }
            else if (apiStatus == 200)
            {
                if (respond is AuthMessageObject messageObject)
                {
                    UserDetails.Username = UsernameEditText.Text;
                    UserDetails.FullName = UsernameEditText.Text;
                    UserDetails.Password = PasswordEditText.Text;
                    UserDetails.UserId = messageObject.UserId;
                    UserDetails.Status = "Active";
                    UserDetails.Email = UsernameEditText.Text;

                    Intent newIntent = new Intent(this, typeof(VerificationCodeActivity));
                    newIntent.PutExtra("TypeCode", "TwoFactor");
                    StartActivity(newIntent);
                }
            }
            else if (apiStatus == 400)
            {
                if (respond is ErrorObject error)
                {
                    var errorText = error.Error.ErrorText;
                    var errorId = error.Error.ErrorId;
                    if (errorId == "3")
                        Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), GetText(Resource.String.Lbl_ErrorLogin_3), GetText(Resource.String.Lbl_Ok));
                    else if (errorId == "4")
                        Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), GetText(Resource.String.Lbl_ErrorLogin_4), GetText(Resource.String.Lbl_Ok));
                    else if (errorId == "5")
                        Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), GetText(Resource.String.Lbl_ErrorLogin_5), GetText(Resource.String.Lbl_Ok));
                    else
                        Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), errorText, GetText(Resource.String.Lbl_Ok));
                }

                ProgressBar.Visibility = ViewStates.Gone;
                MButtonViewSignIn.Visibility = ViewStates.Visible;
            }
            else if (apiStatus == 404)
            {
                ProgressBar.Visibility = ViewStates.Gone;
                MButtonViewSignIn.Visibility = ViewStates.Visible;
                Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), respond.ToString(), GetText(Resource.String.Lbl_Ok));
            }
        }

        private void PrivacyOnClick(object sender, EventArgs eventArgs)
        {
            try
            {
                string url = InitializeWoWonder.WebsiteUrl + "/terms/privacy-policy";
                new IntentController(this).OpenBrowserFromApp(url);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void TermsOfServiceOnClick(object sender, EventArgs eventArgs)
        {
            try
            {
                string url = InitializeWoWonder.WebsiteUrl + "/terms/terms";
                new IntentController(this).OpenBrowserFromApp(url);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }
        private void ForgetPassOnClick(object sender, EventArgs eventArgs)
        {
            try
            {
                StartActivity(typeof(ForgetPasswordActivity));
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void RegisterButton_Click(object sender, EventArgs e)
        {
            try
            {
                StartActivity(new Intent(this, typeof(RegisterActivity)));
                OverridePendingTransition(Resource.Animation.abc_grow_fade_in_from_bottom, Resource.Animation.abc_shrink_fade_out_from_bottom);
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
                // Logins Facebook
                MFbCallManager?.OnActivityResult(requestCode, (int)resultCode, data);
                base.OnActivityResult(requestCode, resultCode, data);

                //Log.Debug("Login_Activity", "onActivityResult:" + requestCode + ":" + resultCode + ":" + data);
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
                    case 16248 when grantResults.Length > 0 && grantResults[0] == Permission.Granted:
                        if (string.IsNullOrEmpty(UserDetails.DeviceId))
                            OneSignalNotification.Instance.RegisterNotificationDevice(this);
                        break;
                    case 16248:
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

        #region Social Logins

        private string FbAccessToken;

        #region Facebook

        public void OnCancel()
        {
            try
            {
                ProgressBar.Visibility = ViewStates.Gone;
                MButtonViewSignIn.Visibility = ViewStates.Visible;

                //SetResult(Result.Canceled);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        public void OnError(FacebookException error)
        {
            try
            {

                ProgressBar.Visibility = ViewStates.Gone;
                MButtonViewSignIn.Visibility = ViewStates.Visible;

                // Handle exception
                Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), error.Message, GetText(Resource.String.Lbl_Ok));

                //SetResult(Result.Canceled);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        public void OnSuccess(Object result)
        {
            try
            {
                //var loginResult = result as LoginResult;
                //var id = AccessToken.CurrentAccessToken.UserId;

                ProgressBar.Visibility = ViewStates.Visible;
                MButtonViewSignIn.Visibility = ViewStates.Gone;

                //SetResult(Result.Ok);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        public async void OnCompleted(JSONObject json, GraphResponse response)
        {
            try
            {
                var accessToken = AccessToken.CurrentAccessToken;
                if (accessToken != null)
                {
                    FbAccessToken = accessToken.Token;

                    var (apiStatus, respond) = await RequestsAsync.Auth.SocialLoginAsync(FbAccessToken, "facebook", UserDetails.DeviceId);
                    if (apiStatus == 200)
                    {
                        if (respond is AuthObject auth)
                        {
                            //if (AppSettings.EnableSmartLockForPasswords && !string.IsNullOrEmpty(json?.ToString()))
                            //{
                            //    var data = json.ToString();
                            //    var result = JsonConvert.DeserializeObject<FacebookResult>(data);

                            //    //FbEmail = result.Email; 
                            //}

                            SetDataLogin(auth);

                            if (AppSettings.ShowWalkTroutPage)
                            {
                                Intent newIntent = new Intent(this, typeof(WalkTroutActivity));
                                newIntent.PutExtra("class", "login");
                                StartActivity(newIntent);
                            }
                            else
                            {
                                StartActivity(new Intent(this, typeof(ChatTabbedMainActivity)));
                            }

                            Finish();
                        }
                    }
                    else if (apiStatus == 400)
                    {
                        if (respond is ErrorObject error)
                        {
                            var errorText = error.Error.ErrorText;

                            Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), errorText, GetText(Resource.String.Lbl_Ok));
                        }
                    }
                    else if (apiStatus == 404)
                    {
                        var error = respond.ToString();
                        Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), error, GetText(Resource.String.Lbl_Ok));
                    }

                    ProgressBar.Visibility = ViewStates.Gone;
                    MButtonViewSignIn.Visibility = ViewStates.Visible;
                }
            }
            catch (Exception exception)
            {
                ProgressBar.Visibility = ViewStates.Gone;
                MButtonViewSignIn.Visibility = ViewStates.Visible;
                Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), exception.Message, GetText(Resource.String.Lbl_Ok));
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        //======================================================

        #region Google

        private async void SetContentGoogle(string gAccessToken)
        {
            try
            {
                //Successful log in hooray!!
                if (!string.IsNullOrEmpty(gAccessToken))
                {
                    ProgressBar.Visibility = ViewStates.Visible;
                    MButtonViewSignIn.Visibility = ViewStates.Gone;

                    var (apiStatus, respond) = await RequestsAsync.Auth.SocialLoginAsync(gAccessToken, "google", UserDetails.DeviceId);
                    switch (apiStatus)
                    {
                        case 200:
                            {
                                if (respond is AuthObject auth)
                                {
                                    SetDataLogin(auth);

                                    if (AppSettings.ShowWalkTroutPage)
                                    {
                                        Intent newIntent = new Intent(this, typeof(WalkTroutActivity));
                                        newIntent.PutExtra("class", "login");
                                        StartActivity(newIntent);
                                    }
                                    else
                                    {
                                        StartActivity(new Intent(this, typeof(ChatTabbedMainActivity)));
                                    }
                                    Finish();
                                }

                                break;
                            }
                        case 400:
                            {
                                if (respond is ErrorObject error)
                                {
                                    var errorText = error.Error.ErrorText;

                                    Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), errorText, GetText(Resource.String.Lbl_Ok));
                                }

                                break;
                            }
                        case 404:
                            {
                                var error = respond.ToString();
                                Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), error, GetText(Resource.String.Lbl_Ok));
                                break;
                            }
                    }

                    ProgressBar.Visibility = ViewStates.Gone;
                    MButtonViewSignIn.Visibility = ViewStates.Visible;
                }
            }
            catch (Exception exception)
            {
                ProgressBar.Visibility = ViewStates.Gone;
                MButtonViewSignIn.Visibility = ViewStates.Visible;
                Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), exception.Message, GetText(Resource.String.Lbl_Ok));
                Methods.DisplayReportResultTrack(exception);
            }
        }

        public void OnError(Object e)
        {
            try
            {
                Console.WriteLine(e);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        public async void OnResult(Object result)
        {
            try
            {
                if (result is GetCredentialResponse response)
                {
                    Credential credential = response.Credential;
                    if (credential is CustomCredential customCredential)
                    {
                        if (customCredential.Type == GoogleIdTokenCredential.TypeGoogleIdTokenCredential)
                        {
                            GoogleIdTokenCredential googleIdTokenCredential = GoogleIdTokenCredential.CreateFrom(credential.Data);

                            if (googleIdTokenCredential != null)
                            {
                                string email = googleIdTokenCredential.Id;
                                string firstName = googleIdTokenCredential.GivenName;
                                string lastName = googleIdTokenCredential.FamilyName;
                                string token = googleIdTokenCredential.IdToken;
                                SetContentGoogle(token);
                            }
                        }
                    }
                    else if (credential is PasswordCredential passwordCredential)
                    {
                        ProgressBar.Visibility = ViewStates.Gone;
                        GoogleSignInButton.Visibility = ViewStates.Visible;
                        await AuthApi(passwordCredential.Id, passwordCredential.Password);
                    }
                }
                else if (result is CreatePublicKeyCredentialResponse credentialResponse)
                {

                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }


        #endregion

        //======================================================

        #endregion

        #region Cross App Authentication

        private void BuildClients(string accountName)
        {
            try
            {
                GetPasswordOption getPasswordOption = new GetPasswordOption();

                GetCredentialRequest getCredRequest = new GetCredentialRequest.Builder()
                    .AddCredentialOption(getPasswordOption)
                    .Build();

                CredentialManager ??= ICredentialManager.Create(this);

                CredentialManager.GetCredentialAsync(this, getCredRequest, new CancellationSignal(), new HandlerExecutor(Looper.MainLooper), this);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        private async Task GetTimezone()
        {
            try
            {
                TimeZone = await ApiRequest.GetTimeZoneAsync();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private async Task<bool> CheckIsActiveUser(string userId)
        {
            try
            {
                var (apiStatus, respond) = await RequestsAsync.Auth.IsActiveUserAsync(userId);
                switch (apiStatus)
                {
                    case 200 when respond is MessageObject auth:
                        Console.WriteLine(auth);
                        return true;
                    case 400:
                        {
                            if (respond is ErrorObject error)
                            {
                                var errorText = error.Error.ErrorText;
                                var errorId = error.Error.ErrorId;
                                switch (errorId)
                                {
                                    case "5":
                                        Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), GetText(Resource.String.Lbl_ThisUserNotActive), GetText(Resource.String.Lbl_Ok));
                                        break;
                                    case "4":
                                        Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), GetText(Resource.String.Lbl_UserNotFound), GetText(Resource.String.Lbl_Ok));
                                        break;
                                    default:
                                        Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), errorText, GetText(Resource.String.Lbl_Ok));
                                        break;
                                }
                            }

                            break;
                        }
                    case 404:
                        Methods.DialogPopup.InvokeAndShowDialog(this, GetText(Resource.String.Lbl_Security), respond.ToString(), GetText(Resource.String.Lbl_Ok));
                        break;
                }

                return false;
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
                return false;
            }
        }

        private void SetDataLogin(AuthObject auth)
        {
            try
            {
                if (UserDetails.Status == "Active")
                    ApiRequest.SwitchAccount(this);

                if (AppSettings.EnableSmartLockForPasswords)
                    CredentialManager?.CreateCredentialAsync(this, new CreatePasswordRequest(UsernameEditText.Text, PasswordEditText.Text), new CancellationSignal(), ContextCompat.GetMainExecutor(this), this);

                Current.AccessToken = UserDetails.AccessToken = auth.AccessToken;

                UserDetails.Username = UsernameEditText.Text;
                UserDetails.FullName = UsernameEditText.Text;
                UserDetails.Password = PasswordEditText.Text;
                UserDetails.UserId = auth.UserId;
                UserDetails.Status = "Active";
                UserDetails.Cookie = auth.AccessToken;
                UserDetails.Email = UsernameEditText.Text;

                //Insert user data to database
                var user = new DataTables.LoginTb
                {
                    UserId = UserDetails.UserId,
                    AccessToken = UserDetails.AccessToken,
                    Cookie = UserDetails.Cookie,
                    Username = UsernameEditText.Text,
                    Password = UsernameEditText.Text,
                    Status = "Active",
                    Lang = "",
                    DeviceId = UserDetails.DeviceId,
                    Email = UserDetails.Email,
                };

                var dbDatabase = new SqLiteDatabase();
                dbDatabase.InsertOrUpdateLogin_Credentials(user);

                PollyController.RunRetryPolicyFunction(new List<Func<Task>> { ApiRequest.Get_MyProfileData_Api });
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

    }
}