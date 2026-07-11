using Android;
using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.Graphics;
using Android.OS;
using Android.Text;
using Android.Views;
using Android.Views.Animations;
using Android.Views.InputMethods;
using Android.Widget;
using AndroidX.AppCompat.App;
using AndroidX.Core.Content;
using AndroidX.Interpolator.View.Animation;
using Bumptech.Glide;
using Com.Aghajari.Emojiview.View;
using Java.IO;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using WoWonder.Activities.Base;
using WoWonder.Activities.ChatWindow.Fragment;
using WoWonder.Activities.StickersView;
using WoWonder.Helpers.CacheLoaders;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Model;
using WoWonder.Helpers.Utils;
using WoWonder.Library.Anjo.Stories.DragView;
using WoWonder.Library.Anjo.XRecordView;
using WoWonderClient;
using WoWonderClient.Classes.Message;
using WoWonderClient.Classes.Story;
using WoWonderClient.Requests;
using Console = System.Console;
using Exception = System.Exception;
using SupportFragment = AndroidX.Fragment.App.Fragment;
using Uri = Android.Net.Uri;

namespace WoWonder.Activities.Story
{
    [Activity(Icon = "@mipmap/icon", Theme = "@style/DragTransparentBlack", ResizeableActivity = true, ConfigurationChanges = ConfigChanges.Locale | ConfigChanges.UiMode | ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Keyboard | ConfigChanges.KeyboardHidden)]
    public class StoryReplyActivity : AppCompatActivity, DragToClose.IDragListener, IOnRecordClickListener, IOnRecordListener
    {
        #region Variables Basic

        private static StoryReplyActivity Instance;
        private DragToClose DragToClose;

        private FrameLayout TopFragmentHolder, ButtonFragmentHolder;

        private LinearLayout RepliedMessageView;
        private TextView TxtOwnerName, TxtMessageType, TxtShortMessage;
        private ImageView MessageFileThumbnail, BtnCloseReply;

        private LinearLayout LayoutEditText;
        private ImageView /*MediaButton,*/ EmojiIcon, StickerButton;
        public ImageView SendButton;
        private AXEmojiEditText TxtMessage;
        public RecordButton RecordButton;
        private RecordView RecordView;

        private LinearLayout RootView;

        private bool IsRecording;

        private ChatRecordSoundFragment ChatRecordSoundBoxFragment;
        private Methods.AudioRecorderAndPlayer RecorderService;
        private FastOutSlowInInterpolator Interpolation;

        public string StoryId, UserId; // to_id  
        private UserDataStory DataStories;

        #endregion

        #region General

        protected override void OnCreate(Bundle savedInstanceState)
        {
            try
            {
                Window?.SetSoftInputMode(SoftInput.AdjustResize);
                base.OnCreate(savedInstanceState);

                Methods.App.FullScreenApp(this, true);

                // Create your application here
                SetContentView(Resource.Layout.StoryReplyLayout);

                Instance = this;

                UserId = Intent?.GetStringExtra("recipientId") ?? "";
                StoryId = Intent?.GetStringExtra("StoryId") ?? "";
                DataStories = JsonConvert.DeserializeObject<UserDataStory>(Intent?.GetStringExtra("DataNowStory") ?? "");

                //Get Value And Set Toolbar
                InitComponent();
                InitBackPressed();
                ReplyItems();
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

        #endregion

        #region Functions

        private void InitComponent()
        {
            try
            {
                RootView = FindViewById<LinearLayout>(Resource.Id.reply_story);

                DragToClose = FindViewById<DragToClose>(Resource.Id.drag_to_close);
                DragToClose.SetCloseOnClick(true);
                DragToClose.SetDragListener(this);

                TopFragmentHolder = FindViewById<FrameLayout>(Resource.Id.TopFragmentHolder);
                ButtonFragmentHolder = FindViewById<FrameLayout>(Resource.Id.ButtomFragmentHolder);

                RepliedMessageView = FindViewById<LinearLayout>(Resource.Id.replied_message_view);
                TxtOwnerName = FindViewById<TextView>(Resource.Id.owner_name);
                TxtMessageType = FindViewById<TextView>(Resource.Id.message_type);
                TxtShortMessage = FindViewById<TextView>(Resource.Id.short_message);
                MessageFileThumbnail = FindViewById<ImageView>(Resource.Id.message_file_thumbnail);
                BtnCloseReply = FindViewById<ImageView>(Resource.Id.clear_btn_reply_view);
                BtnCloseReply.Visibility = ViewStates.Visible;
                MessageFileThumbnail.Visibility = ViewStates.Gone;

                LayoutEditText = FindViewById<LinearLayout>(Resource.Id.LayoutEditText);
                //MediaButton = FindViewById<ImageView>(Resource.Id.mediaButton);
                EmojiIcon = FindViewById<ImageView>(Resource.Id.emojiicon);
                TxtMessage = FindViewById<AXEmojiEditText>(Resource.Id.EmojiconEditText5);
                Methods.SetColorEditText(TxtMessage, WoWonderTools.IsTabDark() ? Color.White : Color.Black);
                InitEmojisView();

                SendButton = FindViewById<ImageView>(Resource.Id.sendButton);

                StickerButton = FindViewById<ImageView>(Resource.Id.StickerButton);

                RecordButton = FindViewById<RecordButton>(Resource.Id.record_button);
                RecordView = FindViewById<RecordView>(Resource.Id.record_view);
                InitRecord();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void InitRecord()
        {
            try
            {
                if (AppSettings.ShowButtonRecordSound)
                {
                    //Audio FrameWork initialize 
                    ChatRecordSoundBoxFragment = new ChatRecordSoundFragment("StoryReplyActivity");
                    RecorderService = new Methods.AudioRecorderAndPlayer(UserId);
                    Interpolation = new FastOutSlowInInterpolator();

                    //ChatSendButton.LongClickable = true;
                    RecordButton.Tag = "Free";
                    RecordButton.SetTheImageResource(Resource.Drawable.icon_mic_vector);
                    RecordButton.SetListenForRecord(true);

                    SendButton.Visibility = ViewStates.Gone;

                    SupportFragmentManager.BeginTransaction().Add(TopFragmentHolder.Id, ChatRecordSoundBoxFragment, "Chat_Recourd_Sound_Fragment");

                    RecordButton.SetRecordView(RecordView);

                    //Cancel Bounds is when the Slide To Cancel text gets before the timer . default is 8
                    RecordView.SetCancelBounds(8);
                    RecordView.SetSmallMicColor(Color.ParseColor("#c2185b"));

                    //prevent recording under one Second
                    RecordView.SetLessThanSecondAllowed(false);
                    RecordView.SetSlideToCancelText(GetText(Resource.String.Lbl_SlideToCancelAudio));
                    RecordView.SetCustomSounds(Resource.Raw.record_start, Resource.Raw.record_finished, Resource.Raw.record_error);
                    RecordView.SetOnRecordListener(this);

                    RecordButton.SetOnRecordClickListener(this); //click on Button 
                }
                else
                {
                    RecordView.Visibility = ViewStates.Gone;
                    SendButton.Visibility = ViewStates.Visible;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void InitEmojisView()
        {
            Methods.SetColorEditText(TxtMessage, Color.White);
            Task.Factory.StartNew(() =>
            {
                try
                {
                    if (WoWonderTools.IsTabDark())
                        EmojisViewTools.LoadDarkTheme();
                    else
                        EmojisViewTools.LoadTheme(AppSettings.MainColor);

                    EmojisViewTools.MStickerView = false;
                    EmojisViewTools.LoadView(this, TxtMessage, "StoryReplyActivity", EmojiIcon);
                }
                catch (Exception e)
                {
                    Methods.DisplayReportResultTrack(e);
                }
            });
        }

        private void InitBackPressed()
        {
            try
            {
                if (Build.VERSION.SdkInt >= BuildVersionCodes.Tiramisu)
                {
                    OnBackInvokedDispatcher.RegisterOnBackInvokedCallback(0, new BackCallAppBase2(this, "StoryReplyActivity"));
                }
                else
                {
                    OnBackPressedDispatcher.AddCallback(new BackCallAppBase1(this, "StoryReplyActivity", true));
                }
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
                    TxtMessage.AfterTextChanged += TxtMessageOnAfterTextChanged;

                    BtnCloseReply.Click += BtnCloseReplyOnClick;
                    SendButton.Click += SendButtonOnClick;
                    //MediaButton.Click += MediaButtonOnClick;
                    StickerButton.Click += StickerButtonOnClick;
                }
                else
                {
                    TxtMessage.AfterTextChanged -= TxtMessageOnAfterTextChanged;

                    BtnCloseReply.Click -= BtnCloseReplyOnClick;
                    SendButton.Click -= SendButtonOnClick;
                    //MediaButton.Click -= MediaButtonOnClick;
                    StickerButton.Click -= StickerButtonOnClick;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public static StoryReplyActivity GetInstance()
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

        #region Events

        private void BtnCloseReplyOnClick(object sender, EventArgs e)
        {
            try
            {
                HideKeyboard();

                Intent resultIntent = new Intent();
                resultIntent.PutExtra("isReply", true);
                SetResult(Result.Ok, resultIntent);

                Finish();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void StickerButtonOnClick(object sender, EventArgs e)
        {
            try
            {
                BrowseStickersFragment fragment = new BrowseStickersFragment();
                Bundle bundle = new Bundle();

                bundle.PutString("TypePage", "StoryReplyActivity");
                fragment.Arguments = bundle;
                fragment.Show(SupportFragmentManager, fragment.Tag);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //Send message text
        private void SendButtonOnClick(object sender, EventArgs e)
        {
            try
            {
                if (SendButton?.Tag?.ToString() == "Audio")
                {
                    SendRecordButton();
                }
                else
                {
                    if (!string.IsNullOrEmpty(TxtMessage.Text) && !string.IsNullOrWhiteSpace(TxtMessage.Text))
                    {
                        Task.Factory.StartNew(() =>
                        {
                            SendMess(UserId, TxtMessage.Text).ConfigureAwait(false);
                        });
                        TxtMessage.Text = "";
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void TxtMessageOnAfterTextChanged(object sender, AfterTextChangedEventArgs e)
        {
            try
            {
                if (e.Editable?.Length() > 0)
                {
                    RecordButton.Visibility = ViewStates.Gone;
                    SendButton.Visibility = ViewStates.Visible;

                    if (AppSettings.ChatTheme == ChatTheme.Default)
                        StickerButton.Visibility = ViewStates.Gone;

                    ApiStatusChat("typing");
                }
                else
                {
                    RecordButton.Visibility = ViewStates.Visible;
                    SendButton.Visibility = ViewStates.Gone;

                    if (AppSettings.ChatTheme == ChatTheme.Default)
                        StickerButton.Visibility = ViewStates.Visible;

                    ApiStatusChat("stopped");
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Permissions && Result

        //Permissions
        public override void OnRequestPermissionsResult(int requestCode, string[] permissions, Permission[] grantResults)
        {
            try
            {
                base.OnRequestPermissionsResult(requestCode, permissions, grantResults);

                if (requestCode == 102)
                {
                    if (grantResults[0] == Permission.Granted)
                    {
                        if (RecordButton?.Tag?.ToString() == "Free")
                        {
                            //Set Record Style
                            IsRecording = true;

                            TxtMessage.Visibility = ViewStates.Invisible;

                            RecorderService = new Methods.AudioRecorderAndPlayer(UserId);
                            //Start Audio record
                            //await Task.Delay(600);
                            RecorderService.StartRecording();
                        }
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

        #region Fragment

        private void ReplaceTopFragment(SupportFragment fragmentView)
        {
            try
            {
                HideKeyboard();

                if (fragmentView.IsVisible)
                    return;

                var trans = SupportFragmentManager.BeginTransaction();
                trans.Replace(TopFragmentHolder.Id, fragmentView);

                if (SupportFragmentManager.BackStackEntryCount == 0)
                {
                    trans.AddToBackStack(null);
                }

                trans.Commit();

                TopFragmentHolder.TranslationY = 1200;
                TopFragmentHolder.Animate()?.SetInterpolator(new FastOutSlowInInterpolator())?.TranslationYBy(-1200)?.SetDuration(500);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void RemoveButtonFragment()
        {
            try
            {
                if (SupportFragmentManager.BackStackEntryCount > 0)
                {
                    SupportFragmentManager.PopBackStack();
                    ResetButtonTags();
                    //ChatStickerButton.Drawable?.SetTint(Color.ParseColor("#888888"));

                    if (SupportFragmentManager.Fragments.Count > 0)
                    {
                        var fragmentManager = SupportFragmentManager.BeginTransaction();
                        foreach (var vrg in SupportFragmentManager.Fragments)
                        {
                            Console.WriteLine(vrg);
                            //if (SupportFragmentManager.Fragments.Contains(ChatStickersTabBoxFragment))
                            //{
                            //    fragmentManager.Remove(ChatStickersTabBoxFragment);
                            //}
                        }

                        fragmentManager.Commit();
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Mic Record 

        public void OnClick(View v)
        {
            try
            {
                //RECORD BUTTON CLICKED
                SendRecordButton();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnStartRecord()
        {
            //record voices 
            try
            {
                Console.WriteLine("OnStartRecord");
                if ((int)Build.VERSION.SdkInt < 23)
                {
                    StartRecordingVoice();
                }
                else
                {
                    //Check to see if any permission in our group is available, if one, then all are
                    if (CheckSelfPermission(Manifest.Permission.RecordAudio) == Permission.Granted)
                    {
                        StartRecordingVoice();
                    }
                    else
                    {
                        new PermissionsController(this).RequestPermission(102);
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        public async void OnCancelRecord()
        {
            try
            {
                Console.WriteLine("OnCancelRecord");
                RecorderService.StopRecording();

                await Task.Delay(1000);

                RecordButton.Tag = "Free";
                RecordButton.SetTheImageResource(Resource.Drawable.icon_mic_vector);
                RecordButton.SetListenForRecord(true);

                RecordButton.Visibility = ViewStates.Visible;
                SendButton.Visibility = ViewStates.Gone;

                // reset mic and show editText  
                LayoutEditText.Visibility = ViewStates.Visible;
                //MediaButton.Visibility = ViewStates.Visible;

                ApiStatusChat("stopped");
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        //open Fragment record and show editText
        public async void OnFinishRecord(long recordTime)
        {
            try
            {
                //OnFinishRecord
                if (IsRecording)
                {
                    RecorderService.StopRecording();
                    var filePath = RecorderService.GetRecorded_Sound_Path();

                    RecordButton.Tag = "Free";
                    RecordButton.SetTheImageResource(Resource.Drawable.icon_mic_vector);
                    RecordButton.SetListenForRecord(true);

                    RecordButton.Visibility = ViewStates.Visible;
                    SendButton.Visibility = ViewStates.Gone;

                    if (recordTime > 0)
                    {
                        if (!string.IsNullOrEmpty(filePath))
                        {
                            Bundle bundle = new Bundle();
                            bundle.PutString("FilePath", filePath);
                            ChatRecordSoundBoxFragment.Arguments = bundle;
                            ReplaceTopFragment(ChatRecordSoundBoxFragment);
                        }
                    }

                    IsRecording = false;
                }

                await Task.Delay(1000);

                LayoutEditText.Visibility = ViewStates.Visible;
                //MediaButton.Visibility = ViewStates.Visible;

                ApiStatusChat("stopped");
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        public void OnLessThanSecond()
        {
            try
            {
                Console.WriteLine("OnLessThanSecond");

                RecordButton.Tag = "Free";
                RecordButton.SetTheImageResource(Resource.Drawable.icon_mic_vector);
                RecordButton.SetListenForRecord(true);

                RecordButton.Visibility = ViewStates.Visible;
                SendButton.Visibility = ViewStates.Gone;

                IsRecording = false;

                LayoutEditText.Visibility = ViewStates.Visible;
                //MediaButton.Visibility = ViewStates.Visible;

                ApiStatusChat("stopped");
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private async void StartRecordingVoice()
        {
            try
            {
                if (RecordButton?.Tag?.ToString() == "Free")
                {
                    //Set Record Style
                    IsRecording = true;

                    LayoutEditText.Visibility = ViewStates.Invisible;
                    //MediaButton.Visibility = ViewStates.Invisible;

                    //ResetMediaPlayerInMessages();

                    RecorderService = new Methods.AudioRecorderAndPlayer(UserId);
                    //Start Audio record
                    await Task.Delay(600);
                    RecorderService.StartRecording();

                    ApiStatusChat("recording");
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Drag

        public void OnStartDraggingView()
        {

        }

        public void OnDraggingView(float offset)
        {
            try
            {
                RepliedMessageView.Alpha = offset;
                RootView.Alpha = offset;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnViewClosed()
        {
            try
            {
                Intent resultIntent = new Intent();
                resultIntent.PutExtra("isReply", true);
                SetResult(Result.Ok, resultIntent);

                Finish();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        public void BackPressed()
        {
            try
            {
                if (SupportFragmentManager.BackStackEntryCount > 0)
                {
                    RemoveButtonFragment();
                }
                else
                {
                    Intent resultIntent = new Intent();
                    resultIntent.PutExtra("isReply", true);
                    SetResult(Result.Ok, resultIntent);

                    Finish();
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void ResetButtonTags()
        {
            try
            {
                //ChatStickerButton.Tag = "Closed";
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        //Reply Messages
        private void ReplyItems()
        {
            try
            {
                if (DataStories != null)
                {
                    RepliedMessageView.Visibility = ViewStates.Visible;
                    var animation = new TranslateAnimation(0, 0, RepliedMessageView.Height, 0) { Duration = 300 };

                    RepliedMessageView.StartAnimation(animation);

                    TxtOwnerName.Text = WoWonderTools.GetNameFinal(DataStories.UserData);
                    MessageFileThumbnail.Visibility = ViewStates.Gone;
                    TxtMessageType.Visibility = ViewStates.Visible;
                    TxtMessageType.Text = " • " + GetText(Resource.String.Lbl_Story);

                    //TxtShortMessage.Text = message.Text;

                    MessageFileThumbnail.Visibility = ViewStates.Visible;

                    string mediaFile = "";
                    //image and video 
                    if (!DataStories.Thumbnail.Contains("avatar") && DataStories.Videos.Count == 0)
                        mediaFile = DataStories.Thumbnail;
                    else if (DataStories.Videos.Count > 0)
                        mediaFile = DataStories.Videos[0].Filename;

                    var type = Methods.AttachmentFiles.Check_FileExtension(mediaFile);
                    if (type == "Video")
                    {
                        TxtShortMessage.Text = GetText(Resource.String.video);

                        var fileName = mediaFile.Split('/').Last();
                        mediaFile = WoWonderTools.GetFile(DateTime.Now.Day.ToString(), Methods.Path.FolderDiskStory, fileName, mediaFile, "other");
                        File file2 = new File(mediaFile);
                        try
                        {
                            Uri photoUri = mediaFile.Contains("http") ? Uri.Parse(mediaFile) : FileProvider.GetUriForFile(this, PackageName + ".fileprovider", file2);
                            Glide.With(this)
                                .AsBitmap()
                                .Apply(GlideImageLoader.GetOptions(ImageStyle.CenterCrop, ImagePlaceholders.Drawable))
                                .Load(photoUri) // or URI/path
                                .Into(MessageFileThumbnail);  //image view to set thumbnail to 
                        }
                        catch (Exception e)
                        {
                            Methods.DisplayReportResultTrack(e);

                            Glide.With(this)
                                .AsBitmap()
                                .Apply(GlideImageLoader.GetOptions(ImageStyle.CenterCrop, ImagePlaceholders.Drawable))
                                .Load(file2) // or URI/path
                                .Into(MessageFileThumbnail);  //image view to set thumbnail to 
                        }
                    }
                    else
                    {
                        TxtShortMessage.Text = GetText(Resource.String.image);

                        GlideImageLoader.LoadImage(this, mediaFile, MessageFileThumbnail, ImageStyle.CenterCrop, ImagePlaceholders.Drawable);
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #region Send Message

        public void SendRecordButton()
        {
            try
            {
                if (SendButton?.Tag?.ToString() == "Audio")
                {
                    TopFragmentHolder?.Animate()?.SetInterpolator(Interpolation)?.TranslationY(1200)?.SetDuration(300);
                    SupportFragmentManager.BeginTransaction().Remove(ChatRecordSoundBoxFragment)?.Commit();

                    string filePath = RecorderService.GetRecorded_Sound_Path();
                    if (!string.IsNullOrEmpty(filePath))
                    {
                        Task.Factory.StartNew(() =>
                        {
                            SendMess(UserId, "", "", filePath).ConfigureAwait(false);
                        });
                    }
                }

                if (AppSettings.ShowButtonRecordSound)
                {
                    RecordButton.Tag = "Free";
                    RecordButton.SetTheImageResource(Resource.Drawable.icon_mic_vector);
                    RecordButton.SetListenForRecord(true);
                }
                else
                {
                    //RecordButton.Tag = "Text";
                    //RecordButton.SetTheImageResource(Resource.Drawable.icon_send_vector); 
                    //RecordButton.SetListenForRecord(false);
                }

                RecordButton.Visibility = ViewStates.Visible;
                SendButton.Visibility = ViewStates.Gone;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public async Task SendMess(string userId = "", string text = "", string contact = "", string pathFile = "", string imageUrl = "", string stickerId = "", string gifUrl = "", string lat = "", string lng = "")
        {
            try
            {
                if (!Methods.CheckConnectivity())
                {
                    ToastUtils.ShowToast(this, GetString(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);
                }
                else
                {
                    var unixTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                    var time2 = unixTimestamp.ToString();

                    //Here on This function will send Selected audio file to the user 
                    var (apiStatus, respond) = await RequestsAsync.Message.SendMessageAsync(userId, time2, "", text, contact, pathFile, imageUrl, stickerId, gifUrl, "", lat, lng, StoryId);
                    if (apiStatus == 200)
                    {
                        if (respond is SendMessageObject result)
                        {
                            Console.WriteLine(result.MessageData);
                            MessageController.UpdateLastIdMessage(result);

                            RunOnUiThread(() =>
                            {
                                try
                                {
                                    Intent resultIntent = new Intent();
                                    resultIntent.PutExtra("isReply", true);
                                    SetResult(Result.Ok, resultIntent);

                                    Finish();
                                }
                                catch (Exception e)
                                {
                                    Methods.DisplayReportResultTrack(e);
                                }
                            });
                        }
                    }
                    else Methods.DisplayReportResult(this, respond);
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Keyboard

        private void HideKeyboard()
        {
            try
            {
                var inputManager = (InputMethodManager)GetSystemService(InputMethodService);
                inputManager?.HideSoftInputFromWindow(CurrentFocus?.WindowToken, HideSoftInputFlags.None);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        /// <summary>
        /// 
        /// </summary>
        /// <param name="type">stopped,recording,typing</param>
        private void ApiStatusChat(string type)
        {
            try
            {
                if (AppSettings.ConnectionTypeChat == InitializeWoWonder.ConnectionType.Socket)
                {
                    if (type == "stopped")
                    {
                        UserDetails.Socket?.EmitAsync_StoppedEvent(UserId, UserDetails.AccessToken);
                    }
                    else if (type == "recording")
                    {
                        UserDetails.Socket?.EmitAsync_RecordingEvent(UserId, UserDetails.AccessToken);
                    }
                    else if (type == "typing")
                    {
                        UserDetails.Socket?.EmitAsync_TypingEvent(UserId, UserDetails.AccessToken);
                    }
                }
                else
                {
                    PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => RequestsAsync.Message.SetChatTypingStatusAsync(UserId, type) });
                }
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
            }
        }

        #endregion

    }
}