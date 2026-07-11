using Android.App;
using Android.Content.PM;
using Android.Content.Res;
using Android.Graphics;
using Android.Graphics.Drawables;
using Android.OS;
using Android.Util;
using Android.Views;
using Android.Widget;
using AndroidX.RecyclerView.Widget;
using Com.Aghajari.Emojiview.View;
using DE.Hdodenhof.CircleImageViewLib;
using Google.Android.Material.FloatingActionButton;
using Java.Lang;
using Newtonsoft.Json;
using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Top.Defaults.Drawabletoolbox;
using WoWonder.Activities.Base;
using WoWonder.Activities.ChatGpt.Adapters;
using WoWonder.Activities.ChatWindow;
using WoWonder.Activities.SettingsPreferences;
using WoWonder.Activities.StickersView;
using WoWonder.Adapters;
using WoWonder.Helpers.Model;
using WoWonder.Helpers.Utils;
using WoWonderClient.Classes.Message;
using Exception = System.Exception;

namespace WoWonder.Activities.ChatGpt
{
    [Activity(Icon = "@mipmap/icon", Theme = "@style/MyTheme", ConfigurationChanges = ConfigChanges.Locale | ConfigChanges.UiMode | ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize)]
    public class ChatGptWindowActivity : BaseActivity
    {
        #region Variables Basic

        private static ChatGptWindowActivity Instance;

        private LinearLayout MainLayout, BodyListChatLayout;
        private ImageView BackButton;
        private CircleImageView UserProfileImage;
        private TextView TxtUsername;

        private RecyclerView MRecyclerSuggestions;

        private RecyclerView MRecycler;
        private ChatGptAdapters MAdapter;
        private Holders.MsgPreCachingLayoutManager LayoutManager;
        private RecyclerViewOnScrollUpListener RecyclerViewOnScrollUpListener;

        private FloatingActionButton FabScrollDown;

        private LinearLayout LayoutEditText;
        private ImageView EmojiIcon;
        public ImageView SendButton;
        private AXEmojiEditText TxtMessage;

        private readonly string MainChatColor = AppSettings.MainColor;

        public AdapterModelsClassMessage SelectedItemPositions;

        #endregion

        #region General

        protected override void OnCreate(Bundle savedInstanceState)
        {
            try
            {
                base.OnCreate(savedInstanceState);

                Methods.App.FullScreenApp(this);

                Window?.SetSoftInputMode(SoftInput.AdjustResize);

                // Create your application here
                SetContentView(Resource.Layout.ChatGptWindowLayout);

                Instance = this;

                //Get Value And Set Toolbar
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

        protected override void OnDestroy()
        {
            try
            {
                Instance = null;
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
                MainLayout = FindViewById<LinearLayout>(Resource.Id.rootChatWindowView);

                BackButton = FindViewById<ImageView>(Resource.Id.BackButton);

                UserProfileImage = FindViewById<CircleImageView>(Resource.Id.userProfileImage);
                UserProfileImage.SetImageResource(Resource.Drawable.icon_chatgpt_vector);

                TxtUsername = FindViewById<TextView>(Resource.Id.Txt_Username);
                TxtUsername.Text = GetText(Resource.String.Lbl_ChatBot);

                BodyListChatLayout = FindViewById<LinearLayout>(Resource.Id.bodyListChatLayout);

                MRecycler = FindViewById<RecyclerView>(Resource.Id.recyler);
                MRecyclerSuggestions = FindViewById<RecyclerView>(Resource.Id.RecyclerSuggestions);

                FabScrollDown = FindViewById<FloatingActionButton>(Resource.Id.fab_scroll);
                FabScrollDown.Visibility = ViewStates.Gone;

                LayoutEditText = FindViewById<LinearLayout>(Resource.Id.LayoutEditText);
                EmojiIcon = FindViewById<ImageView>(Resource.Id.emojiicon);
                TxtMessage = FindViewById<AXEmojiEditText>(Resource.Id.EmojiconEditText5);
                Methods.SetColorEditText(TxtMessage, WoWonderTools.IsTabDark() ? Color.White : Color.Black);
                InitEmojisView();

                SendButton = FindViewById<ImageView>(Resource.Id.sendButton);
                SendButton.Visibility = ViewStates.Visible;

                SetThemeView();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void InitEmojisView()
        {
            Task.Factory.StartNew(() =>
            {
                try
                {
                    if (WoWonderTools.IsTabDark())
                        EmojisViewTools.LoadDarkTheme();
                    else
                        EmojisViewTools.LoadTheme(MainChatColor);

                    EmojisViewTools.MStickerView = false;
                    EmojisViewTools.LoadView(this, TxtMessage, "ChatGptWindowActivity", EmojiIcon);
                }
                catch (Exception e)
                {
                    Methods.DisplayReportResultTrack(e);
                }
            });
        }

        private void SetRecyclerViewAdapters()
        {
            try
            {
                MAdapter = new ChatGptAdapters(this) { ContentList = new ObservableCollection<AdapterModelsClassMessage>() };

                LayoutManager = new Holders.MsgPreCachingLayoutManager(this) { Orientation = LinearLayoutManager.Vertical };
                LayoutManager.SetPreloadItemCount(35);
                LayoutManager.AutoMeasureEnabled = false;
                LayoutManager.SetExtraLayoutSpace(2000);
                LayoutManager.StackFromEnd = true;

                MRecycler.SetLayoutManager(LayoutManager);
                MRecycler.HasFixedSize = true;
                MRecycler.SetItemViewCacheSize(10);
                MRecycler.GetLayoutManager().ItemPrefetchEnabled = true;
                ((SimpleItemAnimator)MRecycler.GetItemAnimator()).SupportsChangeAnimations = false;
                MRecycler.SetAdapter(MAdapter);

                RecyclerViewOnScrollUpListener = new RecyclerViewOnScrollUpListener(LayoutManager, FabScrollDown);
                RecyclerViewOnScrollUpListener.LoadMoreEvent += MainScrollEventOnLoadMoreEvent;
                MRecycler.AddOnScrollListener(RecyclerViewOnScrollUpListener);

                MRecyclerSuggestions.Visibility = ViewStates.Gone;

                AddStartMessageToList();
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
                    BackButton.Click += BackButtonOnClick;
                    FabScrollDown.Click += FabScrollDownOnClick;
                    MAdapter.ItemLongClick += MAdapterOnItemLongClick;
                    SendButton.Click += SendButtonOnClick;
                }
                else
                {
                    BackButton.Click -= BackButtonOnClick;
                    FabScrollDown.Click -= FabScrollDownOnClick;
                    MAdapter.ItemLongClick -= MAdapterOnItemLongClick;
                    SendButton.Click -= SendButtonOnClick;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public static ChatGptWindowActivity GetInstance()
        {
            try
            {
                return Instance;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return null!;
            }
        }

        #endregion

        #region Menu 

        public override bool OnOptionsItemSelected(IMenuItem item)
        {
            switch (item.ItemId)
            {
                case Android.Resource.Id.Home:
                    Finish();
                    return true;
            }

            return base.OnOptionsItemSelected(item);
        }

        #endregion

        #region Events

        //Back
        private void BackButtonOnClick(object sender, EventArgs e)
        {
            try
            {
                Finish();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //Scroll Down
        private void FabScrollDownOnClick(object sender, EventArgs e)
        {
            try
            {
                MRecycler.ScrollToPosition(MAdapter.ItemCount - 1);
                FabScrollDown.Visibility = ViewStates.Gone;
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void MainScrollEventOnLoadMoreEvent(object sender, EventArgs e)
        {

        }

        //Display options for the message
        private void MAdapterOnItemLongClick(object sender, Holders.MesClickEventArgs e)
        {
            try
            {
                if (e.Position > -1)
                {
                    SelectedItemPositions = MAdapter.GetItem(e.Position);
                    if (SelectedItemPositions != null)
                    {
                        OptionsItemMessageBottomSheet bottomSheet = new OptionsItemMessageBottomSheet();
                        Bundle bundle = new Bundle();
                        bundle.PutString("Type", JsonConvert.SerializeObject(e.Type));
                        bundle.PutString("Page", "ChatGptWindow");
                        bundle.PutString("ItemObject", JsonConvert.SerializeObject(SelectedItemPositions.MesData));
                        bottomSheet.Arguments = bundle;
                        bottomSheet.Show(SupportFragmentManager, bottomSheet.Tag);
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void SendButtonOnClick(object sender, EventArgs e)
        {
            try
            {
                if (!string.IsNullOrEmpty(TxtMessage.Text) && !string.IsNullOrWhiteSpace(TxtMessage.Text))
                    AddMessageToListAndSend(TxtMessage.Text);
            }
            catch (Exception exception)
            {
                Console.WriteLine(exception);
            }
        }

        #endregion

        #region Send Message

        private void AddStartMessageToList()
        {
            try
            {
                string timeNow = DateTime.Now.ToShortTimeString();
                var unixTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                string time2 = Convert.ToString(unixTimestamp);

                var dataMyProfile = ListUtils.MyProfileList.FirstOrDefault();

                MessageDataExtra messageUser = new MessageDataExtra
                {
                    Id = time2,
                    FromId = "0",
                    ToId = UserDetails.UserId,
                    Media = "",
                    Seen = "-1",
                    Time = time2,
                    Position = "left",
                    TimeText = timeNow,
                    ModelType = MessageModelType.LeftText,
                    ErrorSendMessage = false,
                    ChatColor = MainChatColor,
                    MessageHashId = time2,
                    UserData = dataMyProfile,
                    Text = GetText(Resource.String.Lbl_StartMessage_ChatBot),
                    MessageUser = new MessageUserUnion { UserDataClass = dataMyProfile },
                };

                MAdapter.ContentList.Add(new AdapterModelsClassMessage
                {
                    TypeView = messageUser.ModelType,
                    Id = Long.ParseLong(messageUser.Id),
                    MesData = messageUser
                });

                MAdapter.NotifyDataSetChanged();

                //Scroll Down >> 
                MRecycler.ScrollToPosition(MAdapter.ItemCount - 1);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private async void AddMessageToListAndSend(string text)
        {
            try
            {
                //function will send text to the chatGpt api
                if (!Methods.CheckConnectivity())
                {
                    ToastUtils.ShowToast(this, GetString(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);
                    return;
                }

                SendButton.Enabled = false;
                TxtMessage.Text = "";

                string timeNow = DateTime.Now.ToShortTimeString();
                var unixTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                string time2 = Convert.ToString(unixTimestamp);

                var dataMyProfile = ListUtils.MyProfileList.FirstOrDefault();

                MessageDataExtra messageUser = new MessageDataExtra
                {
                    Id = time2,
                    FromId = UserDetails.UserId,
                    ToId = "0",
                    Media = "",
                    Seen = "-1",
                    Time = time2,
                    Position = "right",
                    TimeText = timeNow,
                    ModelType = MessageModelType.RightText,
                    ErrorSendMessage = false,
                    ChatColor = MainChatColor,
                    MessageHashId = time2,
                    UserData = dataMyProfile,
                    MessageUser = new MessageUserUnion { UserDataClass = dataMyProfile },
                };

                if (!string.IsNullOrEmpty(text) && !string.IsNullOrWhiteSpace(text))
                {
                    //remove \n in a string
                    string replacement = Regex.Replace(text, @"\t|\n|\r", "");
                    messageUser.Text = replacement;
                }

                MAdapter.ContentList.Add(new AdapterModelsClassMessage
                {
                    TypeView = messageUser.ModelType,
                    Id = Long.ParseLong(messageUser.Id),
                    MesData = messageUser
                });

                var indexMes = MAdapter.ContentList.IndexOf(MAdapter.ContentList.Last());
                MAdapter.NotifyItemInserted(indexMes);

                //Scroll Down >> 
                MRecycler.ScrollToPosition(MAdapter.ItemCount - 1);

                //send api 
                var (apiStatus, respond) = await OpenAiChatUtils.Instance.GenerateText(text);
                if (apiStatus == 200)
                {
                    timeNow = DateTime.Now.ToShortTimeString();
                    unixTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                    time2 = Convert.ToString(unixTimestamp);

                    //chatGpt api response
                    MessageDataExtra resultMessage = new MessageDataExtra
                    {
                        Id = time2,
                        FromId = "0",
                        ToId = UserDetails.UserId,
                        Media = "",
                        Seen = "-1",
                        Time = time2,
                        Position = "left",
                        TimeText = timeNow,
                        ModelType = MessageModelType.LeftText,
                        ErrorSendMessage = false,
                        ChatColor = MainChatColor,
                        MessageHashId = time2,
                        UserData = dataMyProfile,
                        Text = Methods.FunString.DecodeString(respond),
                        MessageUser = new MessageUserUnion { UserDataClass = dataMyProfile },
                    };

                    MAdapter.ContentList.Add(new AdapterModelsClassMessage
                    {
                        TypeView = resultMessage.ModelType,
                        Id = Long.ParseLong(resultMessage.Id),
                        MesData = resultMessage
                    });

                    var indexResultMes = MAdapter.ContentList.IndexOf(MAdapter.ContentList.Last());
                    MAdapter.NotifyItemInserted(indexResultMes);

                    //Scroll Down >> 
                    MRecycler.ScrollToPosition(MAdapter.ItemCount - 1);

                    SendButton.Enabled = true;
                }
            }
            catch (Exception e)
            {
                SendButton.Enabled = true;
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Set Theme Color & Wallpaper

        public void SetThemeView(bool change = false)
        {
            try
            {
                TypedValue typedValuePrimary = new TypedValue();
                TypedValue typedValueAccent = new TypedValue();

                Theme?.ResolveAttribute(Resource.Attribute.colorPrimary, typedValuePrimary, true);
                Theme?.ResolveAttribute(Resource.Attribute.colorAccent, typedValueAccent, true);
                var colorPrimary = new Color(typedValuePrimary.Data);
                var colorAccent = new Color(typedValueAccent.Data);

                string hex1 = "#" + Integer.ToHexString(colorPrimary).Remove(0, 2);
                string hex2 = "#" + Integer.ToHexString(colorAccent).Remove(0, 2);

                var chatColor = Color.ParseColor(MainChatColor);

                if (change)
                {
                    Drawable drawable = new DrawableBuilder()
                        .Rectangle()
                        .Gradient()
                        .LinearGradient()
                        .Angle(270)
                        .StartColor(Color.ParseColor(hex2))
                        .EndColor(Color.ParseColor(hex1))
                        .StrokeWidth(0)
                        .Build();

                    MainLayout.Background = drawable;
                }

                BodyListChatLayout.SetBackgroundColor(WoWonderTools.IsTabDark() ? Color.ParseColor("#282828") : Color.ParseColor("#F1F1F2"));

                UserProfileImage.BorderColor = chatColor;

                FabScrollDown.BackgroundTintList = ColorStateList.ValueOf(chatColor);
                FabScrollDown.SetRippleColor(ColorStateList.ValueOf(chatColor));

                if (change)
                {
                    InitEmojisView();
                }

                if (AppSettings.ShowSettingsWallpaper)
                    GetWallpaper();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void SetTheme(string color)
        {
            try
            {
                //Default Color >> AppSettings.MainColor
                SetTheme(WoWonderTools.IsTabDark() ? Resource.Style.MyTheme_Dark : Resource.Style.MyTheme);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void GetWallpaper()
        {
            try
            {
                //wael you check when image background  
                string path = MainSettings.SharedData?.GetString("Wallpaper_key", string.Empty);
                if (!string.IsNullOrEmpty(path))
                {
                    var type = Methods.AttachmentFiles.Check_FileExtension(path);
                    if (type == "Image")
                    {
                        BodyListChatLayout.Background = Drawable.CreateFromPath(path);
                    }
                    else if (path.Contains("#"))
                    {
                        BodyListChatLayout.SetBackgroundColor(Color.ParseColor(path));
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

    }
}