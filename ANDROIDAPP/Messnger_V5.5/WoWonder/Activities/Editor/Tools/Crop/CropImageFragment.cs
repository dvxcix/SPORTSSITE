using Android.Content;
using Android.Graphics;
using Android.OS;
using Android.Views;
using Android.Widget;
using AndroidX.RecyclerView.Widget;
using Google.Android.Material.BottomSheet;
using IsseiAoki.SimpleCropView;
using System;
using WoWonder.Activities.Editor.Model;
using WoWonder.Helpers.Utils;

namespace WoWonder.Activities.Editor.Tools.Crop
{
    public class CropImageFragment : BottomSheetDialogFragment, IDialogInterfaceOnShowListener
    {
        #region Variables Basic

        private AspectRatioPreviewAdapter RatiosAdapter;
        private LinearLayout CropLayout;

        private RecyclerView RecyclerCrop;
        private ImageView ImgCloseCrop, ImgSaveCrop;
        private ImageView ImgFlipHorizontal, ImgRotate, ImgFlipVertical;

        private readonly Bitmap CurrentBitmap;
        private CropImageView CropView;
        private IOnCropPhotoListener OnCropPhotoListener;

        #endregion

        #region General

        public CropImageFragment(Bitmap bitmap)
        {
            CurrentBitmap = bitmap;
        }

        public override void OnCreate(Bundle savedInstanceState)
        {
            base.OnCreate(savedInstanceState);

            HasOptionsMenu = true;
        }

        public override View OnCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState)
        {
            try
            {
                var view = inflater.Inflate(Resource.Layout.CropLayout, container, false);
                return view;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return null!;
            }
        }

        public override void OnViewCreated(View view, Bundle savedInstanceState)
        {
            try
            {
                base.OnViewCreated(view, savedInstanceState);
                Dialog?.SetOnShowListener(this);

                //Get Value And Set Toolbar
                InitComponent(view);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);

            }
        }

        public void OnShow(IDialogInterface dialog)
        {
            try
            {
                var d = dialog as BottomSheetDialog;
                var bottomSheet = d.FindViewById<View>(Resource.Id.design_bottom_sheet) as FrameLayout;
                var bottomSheetBehavior = BottomSheetBehavior.From(bottomSheet);
                var layoutParams = bottomSheet.LayoutParameters;

                if (layoutParams != null)
                    layoutParams.Height = Resources.DisplayMetrics.HeightPixels;
                bottomSheet.LayoutParameters = layoutParams;
                bottomSheetBehavior.State = BottomSheetBehavior.StateExpanded;
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }
        public override void OnLowMemory()
        {
            try
            {
                GC.Collect(GC.MaxGeneration);
                base.OnLowMemory();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

        #region Functions

        private void InitComponent(View view)
        {
            try
            {
                CropLayout = view.FindViewById<LinearLayout>(Resource.Id.cropLayout);

                CropView = view.FindViewById<CropImageView>(Resource.Id.crop_view);
                CropView.SetCropMode(CropImageView.CropMode.Free);
                CropView.SetImageBitmap(CurrentBitmap);

                RecyclerCrop = view.FindViewById<RecyclerView>(Resource.Id.rvCropView);

                ImgFlipHorizontal = view.FindViewById<ImageView>(Resource.Id.img_h_flip);
                ImgRotate = view.FindViewById<ImageView>(Resource.Id.img_rotate);
                ImgFlipVertical = view.FindViewById<ImageView>(Resource.Id.img_v_flip);

                ImgCloseCrop = view.FindViewById<ImageView>(Resource.Id.imgCloseCrop);
                ImgSaveCrop = view.FindViewById<ImageView>(Resource.Id.imgSaveCrop);

                RatiosAdapter = new AspectRatioPreviewAdapter(Activity);
                var layoutManager = new LinearLayoutManager(Context, LinearLayoutManager.Horizontal, false);
                RecyclerCrop.SetLayoutManager(layoutManager);

                RecyclerCrop.SetAdapter(RatiosAdapter);
                RatiosAdapter.ItemClick += RatiosAdapterOnItemClick;

                ImgCloseCrop.Click += ImgCloseCropOnClick;
                ImgSaveCrop.Click += ImgSaveCropOnClick;

                ImgFlipHorizontal.Click += ImgFlipHorizontalOnClick;
                ImgRotate.Click += ImgRotateOnClick;
                ImgFlipVertical.Click += ImgFlipVerticalOnClick;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void SetOnCropPhotoListener(IOnCropPhotoListener listener)
        {
            OnCropPhotoListener = listener;
        }

        #endregion

        #region Events

        private void RatiosAdapterOnItemClick(object sender, AspectRatioPreviewAdapterClickEventArgs e)
        {
            try
            {
                var position = e.Position;
                if (position >= 0)
                {
                    var item = RatiosAdapter.GetItem(position);
                    if (item != null)
                    {
                        RatiosAdapter.Click_item(item);

                        if (item.Width == 10 && item.Height == 10)
                        {
                            CropView.SetCropMode(CropImageView.CropMode.Free);
                        }
                        else
                        {
                            CropView.SetCustomRatio(item.Width, item.Height);
                        }
                    }
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //save Crop layout  
        private void ImgSaveCropOnClick(object sender, EventArgs e)
        {
            try
            {
                var bitmap = CropView.CroppedBitmap;
                OnCropPhotoListener?.OnFinishCrop(bitmap);

                Dismiss();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //close Crop layout without save
        private void ImgCloseCropOnClick(object sender, EventArgs e)
        {
            try
            {
                Dismiss();
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //Flip Vertical
        private void ImgFlipVerticalOnClick(object sender, EventArgs e)
        {
            try
            {

            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //Rotate
        private void ImgRotateOnClick(object sender, EventArgs e)
        {
            try
            {
                CropView.RotateImage(CropImageView.RotateDegrees.Rotate90d);
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        //Flip Horizontal
        private void ImgFlipHorizontalOnClick(object sender, EventArgs e)
        {
            try
            {

            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

    }
}