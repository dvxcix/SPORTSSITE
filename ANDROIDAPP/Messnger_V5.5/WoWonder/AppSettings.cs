//Use DoughouzChecker last version 5.1 to 
//build your own certifcate 
//For Full Documention 
//https://doughouzlight.com/?onepage-docs=wowonder-android
//CopyRight DoughouzLight
//For the accuracy of the icon and logo, please use this website " https://appicon.co/ " and add images according to size in folders " mipmap " 

using Android.App;
using SocketIOClient.Transport;
using WoWonder.Helpers.Model;
using WoWonderClient;

namespace WoWonder
{
    internal static class AppSettings
    {
        /// <summary>
        /// Deep Links To App Content
        /// you should add your website without http in the analytic.xml file >> ../values/analytic.xml .. line 5
        /// <string name="ApplicationUrlWeb">demo.wowonder.com</string>
        /// </summary>
        public static readonly string TripleDesAppServiceProvider = "jRG1GijaO38Mz4jjeJpQMPP5Oxa04e26IbGF29bAYTcKye+J/O9oDApyI6s3NeeUhsC46dZNyWuHHqbSOYZTuRWelQuNqJ8hFB60y1VgrlXzXVlJ32ff5SvXZPsY5PpvTXQR1/OFhpBQQiOPX6HoZZuK43uqt0ymctYWwuNaMG24WXGoDcC9rArVtWn90iVVzbSoBuptaAI61RCf+sRUQoeL3bJiaWkehiB6pAPrPYu6zuEdPP6vLiyDb+3luQLVkXStpDY0BAJsEAL/jtA29gsuY11T5/oBd5k97Wte7h/IGOGT/Hb0djFsu/yCXBOo5n2/2DuPYc4Ikr03QhAztEn3Xp8TqtjNUyL+3aVcTCoGx8EaQu+3DhM9bSyOCqd87TB600s5387kIg3jhk1zf+SMV0Hv87TiuMnWqQpl4g6mC0N9DZSO6Z225rcGdDI7nuluZN/SzbzEACmpTGVigQv3KBd3WMk2Ekubx51YIKCfeGIDTLuqjoeTW4DKdEMiVim7SV9x9ulM1cOFH0l++I/hVlvqubYIT2QuAeBfpP2udOyt8qB0LDo5TJW8iqjQaRlDSpaSUTEzhSdeCwBPOy3CwSZFcv9UTRA1dzKzQVjUQ3XYAiMLXnfTE94nd8crKYOSBORQxTF2oWJlAqXpyOxI/stFq4WWAaFF26vrDpGfmhZarnNV4GYj5IkOsfOAHRj8w9InLY0ZfLFTyBpyxDlGAi9nZqkjP8tgRVzja6XfMQl5eo4HDNjXjucJHrgJzuXftZaoBACAZaY4arftO+fLA3Egiwn1pzkYicmCTd4O/6vm6IxclTN/7K+5Y9G0GG3OtMCvuzYUoW/n3BAim0CAT8cNXfgj3vhgOKOm1DgBw1EoiCB2sdCW/bSegozw3h0fEQvtdaU0OZ0xG0L2M8gNIzlTEz4KPZsC836rVbR2hEogfD2uNqz895BGleGPV7sLw3eWvTbUAOEvzUNRtUbdkaq6mw1WKi6/JdY22Sk4pecMgREhY12bxgJraoVZOvBd5vyGq3xFAvFqY3NS/xGDtAenFQVvwbWewCfb5Do/HSfbtL1YigAHB9I5uDHlqwdyDT01UqNRHb+rT6qFvYrxlNCbk8xfeVaNqatiBBKUg92hQb2Cnl7fjw1yYPwnCIiPc72NFPCmOb0Nomqjv5s9Cb/uJsOV11Eny2MCC7wj1pblim4ZnwEYBSXop8pcVUzSEytjSMwKZVuo85BXwe0/5tGrx+31+BQoq4Ug1+uH4jcOhNesBO8kEQ01wnUuxNdjLe0m9kOQq8cJVLhyjwl1pdSA7dPXW6MSpVfO3TCIvySOfmq4I03trcQERqMIMCsecd8oV+7udTF8UmB9z6r8y0r8jkv1d2m08hvJSh+AX2VpDjEaxNA3WgCHGOx0ZkYY7Pq/MJdtfgOzRr89Lkr/RxA3fioJYVP62qQRU7uOjFCYuN1nE6KSwVuVZmxdf0oo2K7N0cE44Lw1J6dnGCPpJ+PZTWeLlvXwaiDyyY2tRWbEDnp89pGAd55PW6F6i4lPuSn8vh9vHYX3tBRT4+Rg0sbz36GMr3aIV4Ivu2OJoENTOgQqCEM400DHY3bjr+PvMNWhJa0f3ygm1gSoESCnMihN9n8YaSrI7pJs+PgaCzkGG2RGxbnEq5MIiR79";

        //Main Settings >>>>>
        //********************************************************* 
        public static string Version = "5.5";
        public static readonly string ApplicationName = "WoWonder Messenger";
        public static readonly string DatabaseName = "WoWonderMessenger";

        // Friend system = 0 , follow system = 1
        public static readonly int ConnectivitySystem = 1;

        public static readonly InitializeWoWonder.ConnectionType ConnectionTypeChat = InitializeWoWonder.ConnectionType.Socket;
        public static readonly string PortSocketServer = "449";
        public static readonly TransportProtocol Transport = TransportProtocol.Polling;

        //Main Colors >>
        //*********************************************************
        public static readonly string MainColor = Application.Context.GetText(Resource.Color.accent);
        public static readonly string StoryReadColor = "#808080";

        //Language Settings >> http://www.lingoes.net/en/translator/langcode.htm
        //*********************************************************
        public static bool FlowDirectionRightToLeft = false;
        public static string Lang = ""; //Default language ar_AE

        //Set Language User on site from phone 
        public static readonly bool SetLangUser = true;

        //Notification Settings >>
        //*********************************************************
        public static bool ShowNotification = true;
        public static string OneSignalAppId = "64974c58-9993-40ed-b782-0814edc401ea";

        //Error Report Mode
        //*********************************************************
        public static readonly bool SetApisReportMode = false;

        //Code Time Zone (true => Get from Internet , false => Get From #CodeTimeZone )
        //*********************************************************
        public static readonly bool AutoCodeTimeZone = true;
        public static readonly string CodeTimeZone = "UTC";

        public static readonly bool EnableRegisterSystem = true;

        //Set Theme Full Screen App
        //*********************************************************
        public static readonly bool EnableFullScreenApp = false;

        public static readonly bool ShowSettingsUpdateManagerApp = false;

        public static readonly bool ShowSettingsRateApp = true;
        public static readonly int ShowRateAppCount = 5;

        //AdMob >> Please add the code ad in the Here and analytic.xml 
        //********************************************************* 
        public static readonly ShowAds ShowAds = ShowAds.AllUsers;

        public static readonly bool RewardedAdvertisingSystem = true;

        //Three times after entering the ad is displayed
        public static readonly int ShowAdInterstitialCount = 5;
        public static readonly int ShowAdRewardedVideoCount = 5;
        public static int ShowAdNativeCount = 14;
        public static readonly int ShowAdAppOpenCount = 3;

        public static readonly bool ShowAdMobBanner = true;
        public static readonly bool ShowAdMobInterstitial = true;
        public static readonly bool ShowAdMobRewardVideo = true;
        public static readonly bool ShowAdMobNative = true;
        public static readonly bool ShowAdMobAppOpen = true;
        public static readonly bool ShowAdMobRewardedInterstitial = true;

        public static readonly string AdInterstitialKey = "ca-app-pub-5135691635931982/3442638218";
        public static readonly string AdRewardVideoKey = "ca-app-pub-5135691635931982/3814173301";
        public static readonly string AdAdMobNativeKey = "ca-app-pub-5135691635931982/9452678647";
        public static readonly string AdAdMobAppOpenKey = "ca-app-pub-5135691635931982/3836425196";
        public static readonly string AdRewardedInterstitialKey = "ca-app-pub-5135691635931982/7476900652";

        //FaceBook Ads >> Please add the code ad in the Here and analytic.xml 
        //*********************************************************
        public static readonly bool ShowFbBannerAds = false;
        public static readonly bool ShowFbInterstitialAds = false;
        public static readonly bool ShowFbRewardVideoAds = false;
        public static readonly bool ShowFbNativeAds = false;

        public static readonly string AdsFbBannerKey = "250485588986218_554026418632132";
        public static readonly string AdsFbInterstitialKey = "250485588986218_554026125298828";
        public static readonly string AdsFbRewardVideoKey = "250485588986218_554072818627492";
        public static readonly string AdsFbNativeKey = "250485588986218_554706301897477";

        //Ads AppLovin >> Please add the code ad in the Here 
        //*********************************************************  
        public static readonly bool ShowAppLovinBannerAds = false;
        public static readonly bool ShowAppLovinInterstitialAds = false;
        public static readonly bool ShowAppLovinRewardAds = false;

        public static string AdsAppLovinBannerId = "27de87b390bb5884";
        public static string AdsAppLovinInterstitialId = "7af32ee3997a12d7";
        public static string AdsAppLovinRewardedId = "99d027a690382f70";
        //********************************************************* 

        //Social Logins >>
        //If you want login with facebook or google you should change id key in the analytic.xml file or AndroidManifest.xml
        //Facebook >> ../values/analytic.xml .. 
        //Google >> ../Properties/AndroidManifest.xml .. line 37
        //*********************************************************
        public static readonly bool EnableSmartLockForPasswords = false;

        public static readonly bool ShowFacebookLogin = true;
        public static readonly bool ShowGoogleLogin = true;

        public static readonly string ClientId = "81603239249-i35mh67livs9gifrlv83e47dd3ohamsg.apps.googleusercontent.com";

        //Chat Window Activity >>
        //*********************************************************
        //if you want this feature enabled go to Properties -> AndroidManefist.xml and remove comments from below code
        //Just replace it with this 5 lines of code
        /*
         <uses-permission android:name="android.permission.READ_CONTACTS" />
         <uses-permission android:name="android.permission.READ_PHONE_NUMBERS" /> 
         */
        public static readonly bool ShowButtonContact = true;
        public static readonly bool InvitationSystem = true;  //Invite friends section
        /////////////////////////////////////

        public static readonly ChatTheme ChatTheme = ChatTheme.Tokyo;

        public static readonly bool ShowButtonCamera = true;
        public static readonly bool ShowButtonImage = true;
        public static readonly bool ShowButtonVideo = true;
        public static readonly bool ShowButtonAttachFile = true;
        public static readonly bool ShowButtonColor = true;
        public static readonly bool ShowButtonStickers = true;
        public static readonly bool ShowButtonMusic = true;
        public static readonly bool ShowButtonGif = true;
        public static readonly bool ShowButtonLocation = true;

        public static readonly bool OpenVideoFromApp = true;
        public static readonly bool OpenImageFromApp = true;


        public static readonly bool ShowQrCodeSystem = true;
        public static readonly bool ShowSearchForMessage = true;


        //Record Sound Style & Text 
        public static readonly bool ShowButtonRecordSound = true;

        // Options List Message
        public static readonly bool EnableReplyMessageSystem = true;
        public static readonly bool EnableForwardMessageSystem = true;
        public static readonly bool EnableFavoriteMessageSystem = true;
        public static readonly bool EnablePinMessageSystem = true;
        public static readonly bool EnableReactionMessageSystem = true;

        public static readonly bool ShowNotificationWithUpload = true;

        public static readonly bool AllowDownloadMedia = true;
        public static readonly bool EnableFitchOgLink = true;

        public static readonly bool EnableSuggestionMessage = true;

        /// <summary>
        /// https://dashboard.stipop.io/
        /// you can get api key from here https://prnt.sc/26ofmq9
        /// </summary>
        public static readonly string StickersApikey = "950a22e795ca1f047842854e3305a5df";

        //List Chat >>
        //*********************************************************
        public static readonly bool EnableChatPage = false; //>> Next update 
        public static readonly bool EnableChatGroup = true;

        public static readonly bool EnableBroadcast = true;

        public static readonly bool EnableChatGpt = true; //New

        // Options List Chat
        public static readonly bool EnableChatArchive = true;
        public static readonly bool EnableChatPin = true;
        public static readonly bool EnableChatMute = true;
        public static readonly bool EnableChatMakeAsRead = true;

        // Story >>
        //*********************************************************
        //Set a story duration >> Sec
        public static readonly long StoryImageDuration = 7;
        public static readonly long StoryVideoDuration = 30;

        /// <summary>
        /// If it is false, it will appear only for the specified time in the value of the StoryVideoDuration
        /// </summary>
        public static readonly bool ShowFullVideo = false;

        public static readonly bool EnableStorySeenList = true;
        public static readonly bool EnableReplyStory = true;

        /// <summary>
        /// you can edit video using FFMPEG 
        /// </summary>
        public static readonly bool EnableVideoEditor = true;
        public static readonly bool EnableVideoCompress = false;

        public static readonly bool EnableImageEditor = true; //#New

        /// <summary>
        /// https://developer.deepar.ai/
        /// you can get api key from here https://prnt.sc/b4MBmwlx-6Bx
        /// </summary>
        public static readonly string DeepArKey = "aa1ae193d2e97c3f771146b8d066f7445c65fbf1f8f90a5454a0685c6ffee84915a25262bbed348b"; //#New

        //*********************************************************
        /// <summary>
        ///  Currency
        /// CurrencyStatic = true : get currency from app not api 
        /// CurrencyStatic = false : get currency from api (default)
        /// </summary>
        public static readonly bool CurrencyStatic = false;
        public static readonly string CurrencyIconStatic = "$";
        public static readonly string CurrencyCodeStatic = "USD";

        // Video/Audio Call Settings >>
        //*********************************************************
        public static readonly EnableCall EnableCall = EnableCall.AudioAndVideo;
        public static readonly SystemCall UseLibrary = SystemCall.Agora;

        // Walkthrough Settings >>
        //*********************************************************
        public static readonly bool ShowWalkTroutPage = true;

        // Register Settings >>
        //*********************************************************
        public static readonly bool ShowGenderOnRegister = true;

        //Last Messages Page >>
        //*********************************************************
        public static readonly bool ShowOnlineOfflineMessage = true;

        public static readonly int RefreshAppAPiSeconds = 3500; // 3 Seconds
        public static readonly int MessageRequestSpeed = 4000; // 4 Seconds

        public static readonly ToastTheme ToastTheme = ToastTheme.Default;
        public static readonly ColorMessageTheme ColorMessageTheme = ColorMessageTheme.Default;

        //Bypass Web Errors 
        //*********************************************************
        public static readonly bool TurnTrustFailureOnWebException = true;
        public static readonly bool TurnSecurityProtocolType3072On = true;

        public static readonly bool ShowTextWithSpace = false;

        public static TabTheme SetTabDarkTheme = TabTheme.Light;

        public static readonly bool ShowSuggestedUsersOnRegister = true;

        //Settings Page >> General Account
        public static readonly bool ShowSettingsAccount = true;
        public static readonly bool ShowSettingsPassword = true;
        public static readonly bool ShowSettingsBlockedUsers = true;
        public static readonly bool ShowSettingsDeleteAccount = true;
        public static readonly bool ShowSettingsTwoFactor = true;
        public static readonly bool ShowSettingsManageSessions = true;
        public static readonly bool ShowSettingsWallpaper = true;
        public static readonly bool ShowSettingsFingerprintLock = true;

        //Options chat heads (Bubbles) 
        //*********************************************************
        public static readonly bool ShowChatHeads = false;

        //Always , Hide , FullScreen
        public static readonly string DisplayModeSettings = "Always";

        //Default , Left  , Right , Nearest , Fix , Thrown
        public static readonly string MoveDirectionSettings = "Right";

        //Circle , Rectangle
        public static readonly string ShapeSettings = "Circle";

        // Last position
        public static readonly bool IsUseLastPosition = true;

        public static readonly int AvatarPostSize = 60;
        public static readonly int ImagePostSize = 200;
    }
}