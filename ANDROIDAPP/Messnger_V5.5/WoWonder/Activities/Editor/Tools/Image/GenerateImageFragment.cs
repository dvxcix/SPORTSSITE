using Android.OS;
using Android.Views;
using Android.Widget;
using AndroidHUD;
using AndroidX.AppCompat.Widget;
using Google.Android.Material.BottomSheet;
using System;
using WoWonder.Activities.Editor.Ai;
using WoWonder.Activities.Editor.Model;
using WoWonder.Helpers.Utils;

namespace WoWonder.Activities.Editor.Tools.Image
{
    public class GenerateImageFragment : BottomSheetDialogFragment
    {
        #region Variables Basic

        private TextView TitleText;
        private ImageView IconClose;
        private EditText TextEditText;
        private AppCompatButton bntGenerate;
        private IOnSelectFileListener OnSelectFileListener;

        #endregion

        #region General

        public override View OnCreateView(LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState)
        {
            try
            {
                View view = inflater?.Inflate(Resource.Layout.GenerateImageLayout, container, false);
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
                InitComponent(view);
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
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        #region Functions

        private void InitComponent(View view)
        {
            try
            {
                IconClose = view.FindViewById<ImageView>(Resource.Id.iconClose);
                IconClose.Click += IconCloseOnClick;

                TextEditText = view.FindViewById<EditText>(Resource.Id.TextEditText);

                bntGenerate = view.FindViewById<AppCompatButton>(Resource.Id.bntGenerate);
                bntGenerate.Click += BntGenerateOnClick;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void SetOnSelectFileListener(IOnSelectFileListener listener)
        {
            OnSelectFileListener = listener;
        }

        #endregion

        #region Event

        private void IconCloseOnClick(object sender, EventArgs e)
        {
            Dismiss();
        }

        private async void BntGenerateOnClick(object sender, EventArgs e)
        {
            try
            {
                if (string.IsNullOrEmpty(TextEditText.Text) || string.IsNullOrWhiteSpace(TextEditText.Text))
                {
                    Toast.MakeText(Context, GetText(Resource.String.Lbl_ErrorTypePromptGenerate), ToastLength.Short).Show();
                    return;
                }

                if (!GenerateImageAi.Instance.CheckGenerateImageAi(Context))
                    return;

                if (!Methods.CheckConnectivity())
                    return;

                Methods.HideKeyboard(Activity);
                //Show a progress
                AndHUD.Shared.Show(Context, GetText(Resource.String.Lbl_Loading) + "... ");

                var url = await GenerateImageAi.Instance.GenerateImage(TextEditText.Text);
                if (!string.IsNullOrEmpty(url))
                {
                    OnSelectFileListener.OnSelectFile(url);
                    AndHUD.Shared.Dismiss();
                    Dismiss();
                }
                else
                {
                    AndHUD.Shared.Dismiss();
                    Toast.MakeText(Context, GetText(Resource.String.Lbl_something_went_wrong), ToastLength.Short).Show();
                }
            }
            catch (Exception exception)
            {
                AndHUD.Shared.Dismiss();
                Methods.DisplayReportResultTrack(exception);
            }
        }

        #endregion

    }
}