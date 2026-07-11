using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.Graphics;
using Android.OS;
using Android.Text;
using Android.Views;
using Android.Views.Animations;
using Android.Widget;
using AndroidHUD;
using AndroidX.AppCompat.Widget;
using AndroidX.RecyclerView.Widget;
using DE.Hdodenhof.CircleImageViewLib;
using Google.Android.Material.Dialog;
using Google.Android.Material.Tabs;
using JA.Burhanrashid52.Photoeditor;
using JA.Burhanrashid52.Photoeditor.Shape;
using Java.IO;
using Java.Lang;
using System;
using System.Collections.ObjectModel;
using WoWonder.Activities.Base;
using WoWonder.Activities.Editor.Adapters;
using WoWonder.Activities.Editor.Model;
using WoWonder.Activities.Editor.Tools.Brush;
using WoWonder.Activities.Editor.Tools.Crop;
using WoWonder.Activities.Editor.Tools.Filter;
using WoWonder.Activities.Editor.Tools.Image;
using WoWonder.Activities.Editor.Tools.Sticker;
using WoWonder.Activities.Editor.Tools.Text;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Utils;
using static WoWonder.Helpers.Utils.Methods;
using Console = System.Console;
using Environment = Android.OS.Environment;
using Exception = System.Exception;
using PixelUtil = WoWonder.Helpers.Utils.PixelUtil;
using SeekBar = Android.Widget.SeekBar;
using Uri = Android.Net.Uri;

namespace WoWonder.Activities.Editor
{
    [Activity(Icon = "@mipmap/icon", Theme = "@style/MyTheme", ConfigurationChanges = ConfigChanges.Locale | ConfigChanges.UiMode | ConfigChanges.Keyboard | ConfigChanges.KeyboardHidden | ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize)]
    public class EditImageActivity : BaseActivity, IOnPhotoEditorListener, IPhotoEditor.IOnSaveListener, IOnSelectFileListener, IOnCropPhotoListener
    {
        #region Variables Basic

        private string PathImage;
        private Bitmap DefaultImageBitmap;

        private string SaveImageUri;

        private LinearLayout MainLayout;
        private RelativeLayout SaveControl, WrapPhotoView;

        private ImageView ImgExit, ImgUndo, ImgRedo;
        private AppCompatButton BtnSave;
        private PhotoEditorView PhotoEditorView;
        private EditingToolsAdapter EditingToolsAdapter;
        private RecyclerView MRecycler;

        private IPhotoEditor PhotoEditor;

        private bool IsToolsVisible, IsChanged;
        private ToolType ToolTypeSelected;

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
                SetContentView(Resource.Layout.activity_edit_image);

                PathImage = Intent?.GetStringExtra("PathImage") ?? "";

                //Get Value And Set Toolbar
                InitBackPressed("EditImageActivity");
                InitComponent();
                SetRecyclerViewAdapters();
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
                MainLayout = (LinearLayout)FindViewById(Resource.Id.mainLayout);
                SaveControl = (RelativeLayout)FindViewById(Resource.Id.saveControl);

                ImgExit = (ImageView)FindViewById(Resource.Id.ImgExit);
                ImgUndo = (ImageView)FindViewById(Resource.Id.ImgUndo);
                ImgRedo = (ImageView)FindViewById(Resource.Id.ImgRedo);

                BtnSave = (AppCompatButton)FindViewById(Resource.Id.btnSave);

                WrapPhotoView = (RelativeLayout)FindViewById(Resource.Id.wrap_photo_view);

                PhotoEditorView = (PhotoEditorView)FindViewById(Resource.Id.photoEditorView);

                MRecycler = (RecyclerView)FindViewById(Resource.Id.rvConstraintTools);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void SetRecyclerViewAdapters()
        {
            try
            {
                EditingToolsAdapter = new EditingToolsAdapter(this);
                var layoutManager = new LinearLayoutManager(this, LinearLayoutManager.Horizontal, false);
                MRecycler.SetLayoutManager(layoutManager);
                MRecycler.HasFixedSize = true;
                MRecycler.SetItemViewCacheSize(10);
                MRecycler.GetLayoutManager().ItemPrefetchEnabled = true;
                MRecycler.SetAdapter(EditingToolsAdapter);
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
                    ImgUndo.Click += ImgUndoOnClick;
                    ImgRedo.Click += ImgRedoOnClick;
                    BtnSave.Click += BtnSaveOnClick;
                    EditingToolsAdapter.ItemClick += EditingToolsAdapterOnItemClick;
                }
                else
                {
                    ImgExit.Click -= ImgExitOnClick;
                    ImgUndo.Click -= ImgUndoOnClick;
                    ImgRedo.Click -= ImgRedoOnClick;
                    BtnSave.Click -= BtnSaveOnClick;
                    EditingToolsAdapter.ItemClick -= EditingToolsAdapterOnItemClick;
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
                //handle Intent Image
                if (!string.IsNullOrEmpty(PathImage))
                {
                    PhotoEditorView.Source.SetImageURI(Uri.Parse(PathImage));

                    DefaultImageBitmap = BitmapUtils.GetImageBitmapFromImageView(PhotoEditorView.Source);
                }

                //var WonderFont = Typeface.CreateFromAsset(Assets, "beyond_wonderland.ttf"); 
                var mEmojiTypeFace = Typeface.CreateFromAsset(Assets, "emojione-android.ttf");

                PhotoEditor = new IPhotoEditor.Builder(this, PhotoEditorView)
                    .SetPinchTextScalable(true) // set flag to make text scalable when pinch
                    .SetDefaultEmojiTypeface(mEmojiTypeFace)
                    .Build(); // build photo editor sdk
                PhotoEditor.SetOnPhotoEditorListener(this);
                PhotoEditor.SetFilterEffect(PhotoFilter.None);

                // Init Tools
                InitBrushLayout();
                InitTextLayout();
                InitFilterLayout();
                InitStickerLayout();

                //Show Tools List
                CloseLayoutUi();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Tools - Brush

        private MagicBushAdapter BushAdapter;
        private ColorPickerAdapter BushColorAdapter;

        private LinearLayout BrushLayout;
        private AppCompatSeekBar BrushSize, OpacitySize;
        private RecyclerView RecyclerMagicBush, RecyclerColorBush;
        private ImageView ImgCloseBrush, ImgSaveBrush;
        public CircleImageView ImgEraser;
        private TextView BrushDraw;
        private ShapeBuilder ShapeBuilder = new ShapeBuilder();

        private void InitBrushLayout()
        {
            try
            {
                BrushLayout = FindViewById<LinearLayout>(Resource.Id.brushLayout);
                BrushLayout.Visibility = ViewStates.Gone;

                BrushSize = FindViewById<AppCompatSeekBar>(Resource.Id.brushSize);
                OpacitySize = FindViewById<AppCompatSeekBar>(Resource.Id.brushOpacity);

                RecyclerMagicBush = FindViewById<RecyclerView>(Resource.Id.rvMagicBush);
                RecyclerColorBush = FindViewById<RecyclerView>(Resource.Id.rvColorBush);

                ImgCloseBrush = FindViewById<ImageView>(Resource.Id.imgCloseBrush);
                ImgEraser = FindViewById<CircleImageView>(Resource.Id.imgEraser);

                ImgSaveBrush = FindViewById<ImageView>(Resource.Id.imgSaveBrush);
                ImgSaveBrush.Visibility = ViewStates.Gone;

                BrushDraw = FindViewById<TextView>(Resource.Id.brush_draw);

                BushAdapter = new MagicBushAdapter(this);
                RecyclerMagicBush.SetLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.Horizontal, false));
                RecyclerMagicBush.SetAdapter(BushAdapter);
                BushAdapter.ItemClick += BushAdapterOnItemClick;

                BushColorAdapter = new ColorPickerAdapter(this, ColorType.ColorNormal);
                RecyclerColorBush.SetLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.Horizontal, false));
                RecyclerColorBush.SetAdapter(BushColorAdapter);
                BushColorAdapter.ItemClick += BushColorAdapterOnItemClick;

                BrushSize.ProgressChanged += BrushSizeOnProgressChanged;
                OpacitySize.ProgressChanged += OpacitySizeOnProgressChanged;

                ImgEraser.Click += ImgEraserOnClick;
                ImgCloseBrush.Click += ImgCloseBrushOnClick;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        //Select Eraser 
        private void ImgEraserOnClick(object sender, EventArgs e)
        {
            try
            {
                PhotoEditor.BrushEraser();

                ImgEraser.BorderColor = PixelUtil.DpToPx(this, 2);
                ImgEraser.BorderWidth = Color.ParseColor(AppSettings.MainColor);

                BrushDraw.Text = GetText(Resource.String.Lbl_eraser);
                OnToolSelected(ToolType.Eraser);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //close Brush layout
        private void ImgCloseBrushOnClick(object sender, EventArgs e)
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

        //select what is magic Bush Shape
        private void BushAdapterOnItemClick(object sender, MagicBushAdapterClickEventArgs e)
        {
            try
            {
                var position = e.Position;
                if (position >= 0)
                {
                    var item = BushAdapter.GetItem(position);
                    if (item != null)
                    {
                        BushAdapter.Click_item(item);
                        PhotoEditor.SetShape(ShapeBuilder.WithShapeType(item.Type));

                        if (ToolTypeSelected == ToolType.Eraser)
                            OnToolSelected(ToolType.Brush);
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        // select Opacity on magic Bush Shape 
        private void OpacitySizeOnProgressChanged(object sender, SeekBar.ProgressChangedEventArgs e)
        {
            try
            {
                PhotoEditor.SetShape(ShapeBuilder.WithShapeOpacity(Integer.ValueOf(e.Progress)));

                if (ToolTypeSelected == ToolType.Eraser)
                    OnToolSelected(ToolType.Brush);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        // select Size on magic Bush Shape 
        private void BrushSizeOnProgressChanged(object sender, SeekBar.ProgressChangedEventArgs e)
        {
            try
            {
                PhotoEditor.SetShape(ShapeBuilder.WithShapeSize(e.Progress));

                if (ToolTypeSelected == ToolType.Eraser)
                    OnToolSelected(ToolType.Brush);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        // select Color on magic Bush Shape 
        private void BushColorAdapterOnItemClick(object sender, ColorPickerAdapterClickEventArgs e)
        {
            try
            {
                var position = e.Position;
                if (position >= 0)
                {
                    var item = BushColorAdapter.GetItem(position);
                    if (item != null)
                    {
                        BushColorAdapter.Click_item(item);
                        PhotoEditor.SetShape(ShapeBuilder.WithShapeColor(Color.ParseColor(item.ColorFirst)));

                        if (ToolTypeSelected == ToolType.Eraser)
                            OnToolSelected(ToolType.Brush);
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
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

        #region Tools - Filter

        private FilterAdapter FilterAdapter;
        private LinearLayout FilterLayout;

        private RecyclerView RecyclerFilter;
        private ImageView ImgCloseFilter, ImgSaveFilter;

        private PhotoFilter PhotoFilterSelected;

        private void InitFilterLayout()
        {
            try
            {
                FilterLayout = FindViewById<LinearLayout>(Resource.Id.filterLayout);
                FilterLayout.Visibility = ViewStates.Gone;

                RecyclerFilter = FindViewById<RecyclerView>(Resource.Id.rvFilterView);

                ImgCloseFilter = FindViewById<ImageView>(Resource.Id.imgCloseFilter);
                ImgSaveFilter = FindViewById<ImageView>(Resource.Id.imgSaveFilter);

                FilterAdapter = new FilterAdapter(this);
                var layoutManager = new LinearLayoutManager(this, LinearLayoutManager.Horizontal, false);
                layoutManager.ItemPrefetchEnabled = true;
                RecyclerFilter.SetLayoutManager(layoutManager);
                RecyclerFilter.HasFixedSize = true;
                RecyclerFilter.SetItemViewCacheSize(100);
                var pool = new RecyclerView.RecycledViewPool();
                pool.SetMaxRecycledViews(0, 0);
                RecyclerFilter.SetRecycledViewPool(pool);
                RecyclerFilter.GetLayoutManager().ItemPrefetchEnabled = true;

                RecyclerFilter.SetAdapter(FilterAdapter);
                FilterAdapter.ItemClick += FilterAdapterOnItemClick;

                ImgCloseFilter.Click += ImgCloseFilterOnClick;
                ImgSaveFilter.Click += ImgSaveFilterOnClick;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        //save Filter layout  
        private void ImgSaveFilterOnClick(object sender, EventArgs e)
        {
            try
            {
                IsChanged = true;
                CloseLayoutUi();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //close Filter layout without save
        private void ImgCloseFilterOnClick(object sender, EventArgs e)
        {
            try
            {
                if (PhotoFilterSelected != null)
                    PhotoEditor.SetFilterEffect(PhotoFilter.None);

                CloseLayoutUi();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //select Filter
        private void FilterAdapterOnItemClick(object sender, FilterAdapterClickEventArgs e)
        {
            try
            {
                var position = e.Position;
                if (position >= 0)
                {
                    var item = FilterAdapter.GetItem(position);
                    if (item != null)
                    {
                        FilterAdapter.Click_item(item);
                        PhotoFilterSelected = item.PhotoFilter;
                        PhotoEditor.SetFilterEffect(PhotoFilterSelected);
                    }
                }
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

        #region Tools - Image

        public void OnSelectFile(string path)
        {
            try
            {
                IsChanged = true;
                PathImage = path;

                InitPhotoEditor();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Tools - Crop Image

        public void OnFinishCrop(Bitmap bitmap)
        {
            try
            {
                IsChanged = true;
                PathImage = "";
                DefaultImageBitmap = bitmap;

                PhotoEditorView.Source.SetScaleType(ImageView.ScaleType.CenterInside);
                PhotoEditorView.Source.SetAdjustViewBounds(true);
                PhotoEditorView.Source.SetImageBitmap(DefaultImageBitmap);

                InitPhotoEditor();
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
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
                else if (!PhotoEditor.IsCacheEmpty || IsChanged)
                {
                    ShowSaveDialog();
                }
                else
                {
                    var resultIntent = new Intent();
                    resultIntent.PutExtra("ImagePath", PathImage);
                    SetResult(Result.Ok, resultIntent);
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

        //take a step forward
        private void ImgRedoOnClick(object sender, EventArgs e)
        {
            try
            {
                PhotoEditor.Redo();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //Undo to back step 
        private void ImgUndoOnClick(object sender, EventArgs e)
        {
            try
            {
                PhotoEditor.Undo();
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
                if (!PhotoEditor.IsCacheEmpty || IsChanged)
                {
                    SaveImage();
                }
                else
                {
                    var resultIntent = new Intent();
                    resultIntent.PutExtra("ImagePath", PathImage);
                    SetResult(Result.Ok, resultIntent);
                    Finish();
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //Tool Selected
        private void EditingToolsAdapterOnItemClick(object sender, EditingToolsAdapterClickEventArgs e)
        {
            try
            {
                var position = e.Position;
                if (position >= 0)
                {
                    var item = EditingToolsAdapter.GetItem(position);
                    if (item != null)
                    {
                        EditingToolsAdapter.Click_item(item);
                        OnToolSelected(item.Type);
                    }
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
                ToolTypeSelected = itemType;
                if (itemType == ToolType.Brush) // Shape
                {
                    PhotoEditor.SetBrushDrawingMode(true);
                    ShapeBuilder = new ShapeBuilder();
                    PhotoEditor.SetShape(ShapeBuilder);

                    BrushSize.Progress = (int)ShapeBuilder.ShapeSize;
                    if (ShapeBuilder.ShapeOpacity != null) OpacitySize.Progress = ShapeBuilder.ShapeOpacity.IntValue();

                    BrushDraw.Text = GetText(Resource.String.Lbl_brush);

                    ShowLayoutUi(BrushLayout);
                }
                else if (itemType == ToolType.Text)
                {
                    TextTypeOption = "Add";
                    StyleBuilder = new TextStyleBuilder();
                    ShowLayoutUi(TextLayout);
                }
                else if (itemType == ToolType.Filter)
                {
                    if (DefaultImageBitmap != null)
                    {
                        FilterAdapter.SetupFilters(DefaultImageBitmap);
                        FilterAdapter.NotifyDataSetChanged();
                    }

                    ShowLayoutUi(FilterLayout);
                }
                else if (itemType == ToolType.Sticker)
                {
                    ShowLayoutUi(StickerLayout);
                }
                else if (itemType == ToolType.Image)
                {
                    GenerateImageFragment fragment = new GenerateImageFragment();
                    fragment.SetOnSelectFileListener(this);
                    fragment.Show(SupportFragmentManager, fragment.Tag);
                }
                else if (itemType == ToolType.CropImage)
                {
                    CropImageFragment fragment = new CropImageFragment(DefaultImageBitmap);
                    fragment.SetOnCropPhotoListener(this);
                    fragment.Show(SupportFragmentManager, fragment.Tag);
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

                MRecycler.Visibility = ViewStates.Gone;
                IsToolsVisible = true;
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
                MRecycler.Visibility = ViewStates.Visible;

                BrushLayout.Visibility = ViewStates.Gone;
                TextLayout.Visibility = ViewStates.Gone;
                FilterLayout.Visibility = ViewStates.Gone;
                StickerLayout.Visibility = ViewStates.Gone;
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
