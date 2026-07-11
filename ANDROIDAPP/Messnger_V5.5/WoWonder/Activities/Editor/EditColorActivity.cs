using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.Graphics;
using Android.OS;
using Android.Text;
using Android.Util;
using Android.Views;
using Android.Views.Animations;
using Android.Widget;
using AndroidHUD;
using AndroidX.AppCompat.Widget;
using AndroidX.RecyclerView.Widget;
using Google.Android.Material.Dialog;
using Google.Android.Material.Tabs;
using JA.Burhanrashid52.Photoeditor;
using Java.IO;
using System;
using System.Collections.ObjectModel;
using WoWonder.Activities.Base;
using WoWonder.Activities.Editor.Adapters;
using WoWonder.Activities.Editor.Model;
using WoWonder.Activities.Editor.Tools.Sticker;
using WoWonder.Activities.Editor.Tools.Text;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Utils;
using static WoWonder.Helpers.Utils.Methods;
using ColorUtils = WoWonder.Helpers.Utils.ColorUtils;
using Console = System.Console;
using Environment = Android.OS.Environment;
using Exception = System.Exception;

namespace WoWonder.Activities.Editor
{
    [Activity(Icon = "@mipmap/icon", Theme = "@style/MyTheme", ConfigurationChanges = ConfigChanges.Locale | ConfigChanges.UiMode | ConfigChanges.Keyboard | ConfigChanges.KeyboardHidden | ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize)]
    public class EditColorActivity : BaseActivity, IOnPhotoEditorListener, IPhotoEditor.IOnSaveListener
    {
        #region Variables Basic

        private int Width, Height;

        private Bitmap DefaultImageBitmap, SelectedColorBitmap;

        private string SaveImageUri;

        private FrameLayout MainLayout;
        private RelativeLayout SaveControl;

        private ImageView ImgExit, ImgText, ImgSticker, ImgColor;
        private AppCompatButton BtnSave;
        private PhotoEditorView PhotoEditorView;

        private LinearLayout OptionLayout;

        private IPhotoEditor PhotoEditor;

        private bool IsToolsVisible;

        #endregion

        #region General

        protected override void OnCreate(Bundle savedInstanceState)
        {
            try
            {
                base.OnCreate(savedInstanceState);

                Window?.SetSoftInputMode(SoftInput.AdjustResize);

                SetTheme(WoWonderTools.IsTabDark() ? Resource.Style.MyTheme_Dark : Resource.Style.MyTheme);

                // Create your application here
                SetContentView(Resource.Layout.activity_edit_color);

                //Get Value And Set Toolbar
                InitBackPressed("EditColorActivity");
                InitComponent();
                InitPhotoEditor();
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
                base.OnTrimMemory(level);
                GC.Collect(GC.MaxGeneration, GCCollectionMode.Forced);
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
                base.OnLowMemory();
                GC.Collect(GC.MaxGeneration);
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
                MainLayout = (FrameLayout)FindViewById(Resource.Id.mainLayout);
                SaveControl = (RelativeLayout)FindViewById(Resource.Id.saveControl);

                ImgExit = (ImageView)FindViewById(Resource.Id.ImgExit);

                ImgText = (ImageView)FindViewById(Resource.Id.img_text);
                ImgSticker = (ImageView)FindViewById(Resource.Id.img_sticker);
                ImgColor = (ImageView)FindViewById(Resource.Id.img_color);

                BtnSave = (AppCompatButton)FindViewById(Resource.Id.btnSave);

                PhotoEditorView = (PhotoEditorView)FindViewById(Resource.Id.photoEditorView);

                OptionLayout = (LinearLayout)FindViewById(Resource.Id.OptionLayout);
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
                    ImgExit.Click += ImgExitOnClick;
                    ImgText.Click += ImgTextOnClick;
                    ImgSticker.Click += ImgStickerOnClick;
                    ImgColor.Click += ImgColorOnClick;
                    BtnSave.Click += BtnSaveOnClick;
                }
                else
                {
                    ImgExit.Click -= ImgExitOnClick;
                    ImgText.Click -= ImgTextOnClick;
                    ImgSticker.Click -= ImgStickerOnClick;
                    ImgColor.Click -= ImgColorOnClick;
                    BtnSave.Click -= BtnSaveOnClick;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Menu

        public override bool OnOptionsItemSelected(IMenuItem item)
        {
            switch (item.ItemId)
            {
                case Android.Resource.Id.Home:
                    BackPressed();
                    return true;
            }

            return base.OnOptionsItemSelected(item);
        }

        #endregion 

        #region Photo Editor

        private void InitPhotoEditor()
        {
            try
            {
                var displayMetrics = new DisplayMetrics();
                WindowManager.DefaultDisplay.GetMetrics(displayMetrics);

                Width = displayMetrics.WidthPixels;
                Height = displayMetrics.HeightPixels;

                int[] color = { Color.ParseColor("#fc8f35"), Color.ParseColor("#de2362") };
                var (gradient, bitmap) = ColorUtils.GetGradientDrawable(color, Width, Height);
                if (bitmap != null)
                {
                    DefaultImageBitmap = bitmap;

                    PhotoEditorView.Source.ClearColorFilter();
                    PhotoEditorView.Source?.SetImageBitmap(bitmap);
                }

                //var WonderFont = Typeface.CreateFromAsset(Assets, "beyond_wonderland.ttf"); 
                var mEmojiTypeFace = Typeface.CreateFromAsset(Assets, "emojione-android.ttf");

                PhotoEditor = new IPhotoEditor.Builder(this, PhotoEditorView)
                    .SetPinchTextScalable(true) // set flag to make text scalable when pinch
                    .SetDefaultEmojiTypeface(mEmojiTypeFace)
                    .Build(); // build photo editor sdk
                PhotoEditor.SetOnPhotoEditorListener(this);
                //PhotoEditor.SetFilterEffect(PhotoFilter.None);

                // Init Tools 
                InitTextLayout();
                InitColorLayout();
                InitStickerLayout();

                //Show Text Tools  
                OnToolSelected(ToolType.Text);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Tools - Text

        private ColorPickerAdapter TextColorAdapter;
        private FontShadowAdapter FontShadowAdapter;
        private FontTypeAdapter FontTypeAdapter;

        private LinearLayout TextLayout;
        private TextView AddText;
        private EditText EditText;

        private RecyclerView RecyclerFontColor, RecyclerFontShadow, RecyclerFontStyle;
        private ImageView ImgCloseText, ImgSaveText;

        private ImageView ImgTextAlignLeft, ImgTextAlignCenter, ImgTextAlignRight, ImgTextBold, ImgTextItalic, ImgTextUnderline, ImgTextStrikethrough;

        private string TextTypeOption = "";
        private View TextViewEditor;

        TextStyleBuilder StyleBuilder = new TextStyleBuilder();

        private Typeface FontTypeSelected;


        private void InitTextLayout()
        {
            try
            {
                TextLayout = FindViewById<LinearLayout>(Resource.Id.textLayout);
                TextLayout.Visibility = ViewStates.Gone;

                AddText = FindViewById<TextView>(Resource.Id.add_text);
                EditText = FindViewById<EditText>(Resource.Id.edit_text);
                EditText.TextChanged += EditTextOnTextChanged;

                RecyclerFontColor = FindViewById<RecyclerView>(Resource.Id.rvFontColor);
                RecyclerFontShadow = FindViewById<RecyclerView>(Resource.Id.rvFontShadow);
                RecyclerFontStyle = FindViewById<RecyclerView>(Resource.Id.rvFontStyle);

                ImgCloseText = FindViewById<ImageView>(Resource.Id.imgCloseText);
                ImgSaveText = FindViewById<ImageView>(Resource.Id.imgSaveText);

                ImgTextAlignLeft = FindViewById<ImageView>(Resource.Id.textAlign_left);
                ImgTextAlignCenter = FindViewById<ImageView>(Resource.Id.textAlign_center);
                ImgTextAlignRight = FindViewById<ImageView>(Resource.Id.textAlign_right);
                ImgTextBold = FindViewById<ImageView>(Resource.Id.text_bold);
                ImgTextItalic = FindViewById<ImageView>(Resource.Id.text_italic);
                ImgTextUnderline = FindViewById<ImageView>(Resource.Id.text_underline);
                ImgTextStrikethrough = FindViewById<ImageView>(Resource.Id.text_strikethrough);

                TextColorAdapter = new ColorPickerAdapter(this, ColorType.ColorNormal);
                RecyclerFontColor.SetLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.Horizontal, false));
                RecyclerFontColor.SetAdapter(TextColorAdapter);
                TextColorAdapter.ItemClick += TextColorAdapterOnItemClick;

                TextColorAdapter = new ColorPickerAdapter(this, ColorType.ColorNormal);
                RecyclerFontColor.SetLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.Horizontal, false));
                RecyclerFontColor.SetAdapter(TextColorAdapter);
                TextColorAdapter.ItemClick += TextColorAdapterOnItemClick;

                FontShadowAdapter = new FontShadowAdapter(this);
                RecyclerFontShadow.SetLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.Horizontal, false));
                RecyclerFontShadow.SetAdapter(FontShadowAdapter);
                FontShadowAdapter.ItemClick += FontShadowAdapterOnItemClick;

                FontTypeAdapter = new FontTypeAdapter(this);
                StaggeredGridLayoutManager staggeredGridLayoutManager = new StaggeredGridLayoutManager(2, LinearLayoutManager.Horizontal);
                RecyclerFontStyle.SetLayoutManager(staggeredGridLayoutManager);
                RecyclerFontStyle.HasFixedSize = true;
                RecyclerFontStyle.SetItemViewCacheSize(50);
                RecyclerFontStyle.GetLayoutManager().ItemPrefetchEnabled = true;
                RecyclerFontStyle.SetAdapter(FontTypeAdapter);
                FontTypeAdapter.ItemClick += FontTypeAdapterOnItemClick;

                ImgCloseText.Click += ImgCloseTextOnClick;
                ImgSaveText.Click += ImgSaveTextOnClick;


                ImgTextAlignLeft.Click += ImgTextAlignLeftOnClick;
                ImgTextAlignCenter.Click += ImgTextAlignCenterOnClick;
                ImgTextAlignRight.Click += ImgTextAlignRightOnClick;
                ImgTextBold.Click += ImgTextBoldOnClick;
                ImgTextItalic.Click += ImgTextItalicOnClick;
                ImgTextUnderline.Click += ImgTextUnderlineOnClick;
                ImgTextStrikethrough.Click += ImgTextStrikethroughOnClick;

            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void EditTextOnTextChanged(object sender, TextChangedEventArgs e)
        {
            try
            {
                AddText.Text = e.Text?.ToString();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //save Text layout  
        private void ImgSaveTextOnClick(object sender, EventArgs e)
        {
            try
            {
                if (TextTypeOption == "Edit")
                {
                    PhotoEditor.EditText(TextViewEditor, AddText.Text, StyleBuilder);
                }
                else
                {
                    PhotoEditor.AddText(AddText.Text, StyleBuilder);
                }

                AddText.Text = "";
                EditText.Text = "";
                TextTypeOption = "";
                StyleBuilder = new TextStyleBuilder();

                CloseLayoutUi();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //close Text layout without save
        private void ImgCloseTextOnClick(object sender, EventArgs e)
        {
            try
            {
                CloseLayoutUi();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //Select color font 
        private void TextColorAdapterOnItemClick(object sender, ColorPickerAdapterClickEventArgs e)
        {
            try
            {
                var position = e.Position;
                if (position >= 0)
                {
                    var item = TextColorAdapter.GetItem(position);
                    if (item != null)
                    {
                        TextColorAdapter.Click_item(item);

                        AddText.SetTextColor(Color.ParseColor(item.ColorFirst));
                        StyleBuilder.WithTextColor(Color.ParseColor(item.ColorFirst));
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //Select font family type 
        private void FontTypeAdapterOnItemClick(object sender, FontTypeAdapterClickEventArgs e)
        {
            try
            {
                var position = e.Position;
                if (position >= 0)
                {
                    var item = FontTypeAdapter.GetItem(position);
                    if (item != null)
                    {
                        FontTypeSelected = item.Type;
                        FontTypeAdapter.Click_item(item);

                        AddText.SetTypeface(item.Type, TypefaceStyle.Normal);

                        StyleBuilder.WithTextFont(item.Type);
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //Select font shadow
        private void FontShadowAdapterOnItemClick(object sender, FontShadowAdapterClickEventArgs e)
        {
            try
            {
                var position = e.Position;
                if (position >= 0)
                {
                    var item = FontShadowAdapter.GetItem(position);
                    if (item != null)
                    {
                        FontShadowAdapter.Click_item(item);

                        AddText.SetShadowLayer(item.Shadow.Radius, item.Shadow.Dx, item.Shadow.Dy, new Color(item.Shadow.Color));

                        StyleBuilder.WithTextShadow(item.Shadow);
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void ImgTextStrikethroughOnClick(object sender, EventArgs e)
        {
            try
            {
                AddText.PaintFlags = AddText.PaintFlags | PaintFlags.StrikeThruText;
                StyleBuilder.WithTextFlag((int)PaintFlags.StrikeThruText);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void ImgTextUnderlineOnClick(object sender, EventArgs e)
        {
            try
            {
                AddText.PaintFlags = AddText.PaintFlags | PaintFlags.UnderlineText;
                StyleBuilder.WithTextFlag((int)PaintFlags.UnderlineText);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void ImgTextItalicOnClick(object sender, EventArgs e)
        {
            try
            {
                AddText.SetTypeface(FontTypeSelected, TypefaceStyle.Italic);
                StyleBuilder.WithTextStyle((int)TypefaceStyle.Italic);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void ImgTextBoldOnClick(object sender, EventArgs e)
        {
            try
            {
                AddText.SetTypeface(FontTypeSelected, TypefaceStyle.Bold);
                StyleBuilder.WithTextStyle((int)TypefaceStyle.Bold);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void ImgTextAlignRightOnClick(object sender, EventArgs e)
        {
            try
            {
                AddText.Gravity = GravityFlags.Right;
                StyleBuilder.WithTextFlag((int)GravityFlags.Right);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void ImgTextAlignCenterOnClick(object sender, EventArgs e)
        {
            try
            {
                AddText.Gravity = GravityFlags.Center;
                StyleBuilder.WithTextFlag((int)GravityFlags.Center);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void ImgTextAlignLeftOnClick(object sender, EventArgs e)
        {
            try
            {
                AddText.Gravity = GravityFlags.Left;
                StyleBuilder.WithTextFlag((int)GravityFlags.Left);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        public void OnEditTextChangeListener(View rootView, string text, int colorCode)
        {
            try
            {
                TextViewEditor = rootView;

                TextTypeOption = "Edit";

                EditText.Text = text;
                AddText.Text = text;

                TextView textView = rootView.FindViewById<TextView>(Resource.Id.tvPhotoEditorText);
                if (textView != null)
                {
                    AddText.Gravity = textView.Gravity;
                    AddText.PaintFlags = textView.PaintFlags;
                    AddText.SetTypeface(textView.Typeface, textView.Typeface.Style);
                    AddText.SetShadowLayer(textView.ShadowRadius, textView.ShadowDx, textView.ShadowDy, textView.ShadowColor);

                    StyleBuilder.WithTextColor(new Color(colorCode));
                    StyleBuilder.WithTextStyle((int)textView.Typeface.Style);
                    StyleBuilder.WithTextFlag((int)textView.PaintFlags);
                    StyleBuilder.WithTextFont(textView.Typeface);
                    StyleBuilder.WithTextShadow(textView.ShadowRadius, textView.ShadowDx, textView.ShadowDy, textView.ShadowColor);
                }

                ShowLayoutUi(TextLayout);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Tools - Sticker

        private StickerAdapter StickerAdapter;
        private LinearLayout StickerLayout;

        private TabLayout TabLayout;
        private RecyclerView RecyclerSticker;
        private ImageView ImgCloseSticker, ImgSaveSticker;

        private void InitStickerLayout()
        {
            try
            {
                StickerLayout = FindViewById<LinearLayout>(Resource.Id.stickerLayout);
                StickerLayout.Visibility = ViewStates.Gone;

                RecyclerSticker = FindViewById<RecyclerView>(Resource.Id.rvStickerView);
                TabLayout = FindViewById<TabLayout>(Resource.Id.tabLayout);

                ImgCloseSticker = FindViewById<ImageView>(Resource.Id.imgCloseSticker);
                ImgSaveSticker = FindViewById<ImageView>(Resource.Id.imgSaveSticker);
                ImgSaveSticker.Visibility = ViewStates.Invisible;

                StickerAdapter = new StickerAdapter(this);
                RecyclerSticker.SetLayoutManager(new GridLayoutManager(this, 4));
                RecyclerSticker.SetAdapter(StickerAdapter);
                StickerAdapter.ItemClick += StickerAdapterOnItemClick;

                ImgCloseSticker.Click += ImgCloseStickerOnClick;
                ImgSaveSticker.Click += ImgSaveStickerOnClick;

                // Set up TabLayout
                TabLayout.RemoveAllTabs();
                TabLayout.AddTab(TabLayout.NewTab().SetText(GetText(Resource.String.Lbl_Sticker)));
                TabLayout.AddTab(TabLayout.NewTab().SetText(GetText(Resource.String.Lbl_emoji)));
                TabLayout.AddTab(TabLayout.NewTab().SetText(GetText(Resource.String.Lbl_Widgets)));

                var stickerList = new ObservableCollection<StickersModel>(StickersUrl.StickerList);
                var emojiList = new ObservableCollection<StickersModel>(EmojisUrl.GetEmojis());
                WidgetsUrl.Instance.GetWidgets(this);

                // Handle tab selection
                TabLayout.TabSelected += (sender, args) =>
                {
                    try
                    {
                        // Update RecyclerView based on selected tab
                        var selectedTabPosition = args.Tab.Position;
                        // Update your data source and notify the adapter 
                        switch (selectedTabPosition)
                        {
                            case 0:
                                {
                                    var layoutManager = new GridLayoutManager(this, 4);
                                    RecyclerSticker.SetLayoutManager(layoutManager);
                                    StickerAdapter.StickerList = stickerList;
                                    break;
                                }
                            case 1:
                                {
                                    var layoutManager = new GridLayoutManager(this, 6);
                                    RecyclerSticker.SetLayoutManager(layoutManager);
                                    StickerAdapter.StickerList = emojiList;
                                    break;
                                }
                            case 2:
                                {
                                    StaggeredGridLayoutManager staggeredGridLayoutManager = new StaggeredGridLayoutManager(2, LinearLayoutManager.Vertical);
                                    RecyclerSticker.SetLayoutManager(staggeredGridLayoutManager);
                                    StickerAdapter.StickerList = new ObservableCollection<StickersModel>(WidgetsUrl.Instance.WidgetList);
                                    break;
                                }
                        }
                        RecyclerSticker.SetAdapter(StickerAdapter);
                    }
                    catch (Exception e)
                    {
                        Methods.DisplayReportResultTrack(e);
                    }
                };
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        //save Sticker layout  
        private void ImgSaveStickerOnClick(object sender, EventArgs e)
        {
            try
            {
                CloseLayoutUi();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //close Sticker layout without save
        private void ImgCloseStickerOnClick(object sender, EventArgs e)
        {
            try
            {
                CloseLayoutUi();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //select Sticker
        private void StickerAdapterOnItemClick(object sender, StickerAdapterClickEventArgs e)
        {
            try
            {
                var position = e.Position;
                if (position >= 0)
                {
                    var item = StickerAdapter.GetItem(position);
                    switch (item?.Type)
                    {
                        case StickersType.Sticker:
                            PhotoEditor.AddImage(item.Image);
                            break;
                        case StickersType.Emoji:
                            PhotoEditor.AddEmoji(item.Content);
                            break;
                        case StickersType.Widget:
                            {
                                if (item.Content == "Hashtags")
                                {
                                    WidgetsUrl.Instance.AddCustomHashtags(this, PhotoEditor);
                                }
                                else
                                {
                                    PhotoEditor.AddImage(item.Image);
                                }
                                break;
                            }
                    }
                    CloseLayoutUi();
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Tools - Color

        private LinearLayout ColorLayout;
        private ColorPickerAdapter ColorAdapter;

        private RecyclerView RecyclerColor;
        private ImageView ImgCloseColor, ImgSaveColor;

        private void InitColorLayout()
        {
            try
            {
                ColorLayout = FindViewById<LinearLayout>(Resource.Id.colorLayout);
                ColorLayout.Visibility = ViewStates.Gone;

                RecyclerColor = FindViewById<RecyclerView>(Resource.Id.rvColor);

                ImgCloseColor = FindViewById<ImageView>(Resource.Id.imgCloseColor);
                ImgSaveColor = FindViewById<ImageView>(Resource.Id.imgSaveColor);

                ColorAdapter = new ColorPickerAdapter(this, ColorType.ColorGradient);
                RecyclerColor.SetLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.Horizontal, false));
                RecyclerColor.SetAdapter(ColorAdapter);
                ColorAdapter.ItemClick += ColorColorAdapterOnItemClick;

                ImgSaveColor.Click += ImgSaveColorOnClick;
                ImgCloseColor.Click += ImgCloseColorOnClick;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        //save Color layout
        private void ImgSaveColorOnClick(object sender, EventArgs e)
        {
            try
            {
                DefaultImageBitmap = SelectedColorBitmap;
                PhotoEditorView.Source?.SetImageBitmap(DefaultImageBitmap);

                SelectedColorBitmap = null;
                CloseLayoutUi();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //close Color layout
        private void ImgCloseColorOnClick(object sender, EventArgs e)
        {
            try
            {
                PhotoEditorView.Source?.SetImageBitmap(DefaultImageBitmap);
                SelectedColorBitmap = null;
                CloseLayoutUi();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        // select Color on magic Color Shape 
        private void ColorColorAdapterOnItemClick(object sender, ColorPickerAdapterClickEventArgs e)
        {
            try
            {
                var position = e.Position;
                if (position >= 0)
                {
                    var item = ColorAdapter.GetItem(position);
                    if (item != null)
                    {
                        ColorAdapter.Click_item(item);

                        int[] color = { Color.ParseColor(item.ColorFirst), Color.ParseColor(item.ColorSecond) };
                        var (gradient, bitmap) = ColorUtils.GetGradientDrawable(color, Width, Height);
                        if (bitmap != null)
                        {
                            SelectedColorBitmap = bitmap;
                            PhotoEditorView.Source?.SetImageBitmap(bitmap);
                        }
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Back Pressed

        public void BackPressed()
        {
            try
            {
                if (IsToolsVisible)
                {
                    CloseLayoutUi();
                }
                else if (!PhotoEditor.IsCacheEmpty)
                {
                    ShowSaveDialog();
                }
                else
                {
                    Finish();
                }
            }
            catch (Exception exception)
            {
                Finish();
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Events

        private void ImgColorOnClick(object sender, EventArgs e)
        {
            try
            {
                OnToolSelected(ToolType.BgColor);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void ImgStickerOnClick(object sender, EventArgs e)
        {
            try
            {
                OnToolSelected(ToolType.Sticker);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void ImgTextOnClick(object sender, EventArgs e)
        {
            try
            {
                OnToolSelected(ToolType.Text);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //close edit image 
        private void ImgExitOnClick(object sender, EventArgs e)
        {
            try
            {
                BackPressed();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //save edit image 
        private void BtnSaveOnClick(object sender, EventArgs e)
        {
            try
            {
                if (!PhotoEditor.IsCacheEmpty)
                {
                    SaveImage();
                }
                else
                {
                    var resultIntent = new Intent();
                    //resultIntent.PutExtra("ImagePath", PathImage);
                    SetResult(Result.Ok, resultIntent);
                    Finish();
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Permissions

        //Permissions
        public override void OnRequestPermissionsResult(int requestCode, string[] permissions, Permission[] grantResults)
        {
            try
            {
                base.OnRequestPermissionsResult(requestCode, permissions, grantResults);

                if (requestCode == 100)
                {
                    if (grantResults.Length > 0 && grantResults[0] == Permission.Granted)
                        SaveImage();
                    else
                        Toast.MakeText(this, GetText(Resource.String.Lbl_Permission_is_denied), ToastLength.Long).Show();
                }
                else if (requestCode == 106)
                {
                    if (grantResults.Length > 0 && grantResults[0] == Permission.Granted)
                        WidgetsUrl.Instance.GetLocation(this);
                    else
                        Toast.MakeText(this, GetText(Resource.String.Lbl_Permission_is_denied), ToastLength.Long).Show();
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Tool Selected 

        private void OnToolSelected(ToolType itemType)
        {
            try
            {
                if (itemType == ToolType.Text)
                {
                    TextTypeOption = "Add";
                    StyleBuilder = new TextStyleBuilder();
                    ShowLayoutUi(TextLayout);
                }
                else if (itemType == ToolType.Sticker)
                {
                    ShowLayoutUi(StickerLayout);
                }
                else if (itemType == ToolType.BgColor)
                {
                    ShowLayoutUi(ColorLayout);
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void ShowLayoutUi(View layout)
        {
            try
            {
                // if (IsToolsVisible)
                //   CloseLayoutUi();

                if (layout.Visibility == ViewStates.Gone)
                {
                    Animation animation = new TranslateAnimation(0, 0, layout.Height, 0);
                    animation.Duration = 300;
                    animation.AnimationEnd += (o, args) =>
                    {
                        try
                        {
                            layout.Visibility = ViewStates.Visible;
                        }
                        catch (Exception exception)
                        {
                            Methods.DisplayReportResultTrack(exception);
                        }
                    };
                    layout.StartAnimation(animation);
                }

                IsToolsVisible = true;
                OptionLayout.Visibility = ViewStates.Gone;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void CloseLayoutUi()
        {
            try
            {
                Methods.HideKeyboard(this);

                IsToolsVisible = false;
                OptionLayout.Visibility = ViewStates.Visible;

                TextLayout.Visibility = ViewStates.Gone;
                StickerLayout.Visibility = ViewStates.Gone;
                ColorLayout.Visibility = ViewStates.Gone;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Photo Editor Listener

        public void OnAddViewListener(ViewType viewType, int numberOfAddedViews)
        {
            Console.WriteLine("onAddViewListener() called with: viewType = [" + viewType + "], numberOfAddedViews = [" + numberOfAddedViews + "]");
        }

        public void OnRemoveViewListener(ViewType viewType, int numberOfAddedViews)
        {
            Console.WriteLine("onRemoveViewListener() called with: viewType = [" + viewType + "], numberOfAddedViews = [" + numberOfAddedViews + "]");
        }

        public void OnStartViewChangeListener(ViewType viewType)
        {
            Console.WriteLine("onStartViewChangeListener() called with: viewType = [" + viewType + "]");
        }

        public void OnStopViewChangeListener(ViewType viewType)
        {
            Console.WriteLine("onStopViewChangeListener() called with: viewType = [" + viewType + "]");
        }

        public void OnTouchSourceImage(MotionEvent @event)
        {
            Console.WriteLine("onTouchView() called with: event = [" + @event + "]");
        }

        #endregion

        #region Save

        private void ShowSaveDialog()
        {
            try
            {
                var dialog = new MaterialAlertDialogBuilder(this);
                dialog.SetTitle(GetText(Resource.String.Lbl_Warning));
                dialog.SetMessage(GetText(Resource.String.Lbl_Are_you_want_to_exit_without_saving_image));
                dialog.SetPositiveButton(GetText(Resource.String.Lbl_Save), (materialDialog, action) =>
                {
                    SaveImage();
                });
                dialog.SetNegativeButton(GetText(Resource.String.Lbl_Cancel), new MaterialDialogUtils());
                dialog.SetNeutralButton(GetText(Resource.String.Lbl_Discard), (materialDialog, action) =>
                {
                    try
                    {
                        var resultIntent = new Intent();
                        SetResult(Result.Canceled, resultIntent);
                        Finish();
                    }
                    catch (Exception e)
                    {
                        Methods.DisplayReportResultTrack(e);
                    }
                });
                dialog.Show();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void SaveImage()
        {
            try
            {
                RunOnUiThread(() =>
                {
                    try
                    {
                        Methods.HideKeyboard(this);
                        //Show a progress
                        AndHUD.Shared.Show(this, GetText(Resource.String.Lbl_Loading) + "... ");

                        if ((int)Build.VERSION.SdkInt < 23)
                        {
                            FileCreate();
                        }
                        else
                        {
                            if (PermissionsController.CheckPermissionStorage(this, "file"))
                            {
                                FileCreate();
                            }
                            else
                            {
                                new PermissionsController(this).RequestPermission(100, "file");
                            }
                        }
                    }
                    catch (Exception e)
                    {
                        Methods.DisplayReportResultTrack(e);
                    }
                });
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        private void FileCreate()
        {
            try
            {
                Methods.Path.Chack_MyFolder();

                var fileName = Methods.GetTimestamp(DateTime.Now) + ".png";
                File file = new File(Environment.GetExternalStoragePublicDirectory(Environment.DirectoryPictures) + File.Separator + "" + fileName);

                file.CreateNewFile();

                SaveSettings saveSettings = new SaveSettings.Builder()
                    .SetClearViewsEnabled(true)
                    .SetTransparencyEnabled(true)
                    .Build();

                PhotoEditor.SaveAsFile(file.AbsolutePath, saveSettings, this);
            }
            catch (Exception e)
            {
                AndHUD.Shared.Dismiss();
                Methods.DisplayReportResultTrack(e);
            }
        }

        public async void OnSuccess(string imagePath)
        {
            try
            {
                await CapturePhotoUtils.InsertImage(ContentResolver, imagePath);

                AndHUD.Shared.Dismiss();

                //Toast.MakeText(this, GetText(Resource.String.Lbl_Image_Saved_Successfully), ToastLength.Long).Show();

                SaveImageUri = imagePath;

                var resultIntent = new Intent();
                resultIntent.PutExtra("ImagePath", imagePath);
                SetResult(Result.Ok, resultIntent);
                Finish();

                //InitPhotoEditor();
            }
            catch (Exception e)
            {
                AndHUD.Shared.Dismiss();
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnFailure(Java.Lang.Exception exception)
        {
            try
            {
                AndHUD.Shared.ShowError(this, GetText(Resource.String.Lbl_Failed_to_save_Image), MaskType.Clear, TimeSpan.FromSeconds(1));
            }
            catch (Exception e)
            {
                AndHUD.Shared.Dismiss();
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

    }
}
