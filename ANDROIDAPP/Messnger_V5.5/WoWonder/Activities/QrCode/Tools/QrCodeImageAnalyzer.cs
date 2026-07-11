using Android.App;
using Android.Graphics;
using AndroidX.Camera.Core;
using Google.ZXing;
using Google.ZXing.Common;
using Google.ZXing.Multi.QRCode;
using System;
using WoWonder.Helpers.Utils;
using FormatException = System.FormatException;
using Object = Java.Lang.Object;

namespace WoWonder.Activities.QrCode.Tools
{
    public interface IQrCodeFoundListener
    {
        void OnQrCodeFound(string qrCode);
        void QrCodeNotFound();
    }

    public class QrCodeImageAnalyzer : Object, ImageAnalysis.IAnalyzer
    {
        private readonly IQrCodeFoundListener Listener;
        private readonly Activity Activity;

        public QrCodeImageAnalyzer(Activity activity, IQrCodeFoundListener listener)
        {
            Activity = activity;
            Listener = listener;
        }

        public void Analyze(IImageProxy image)
        {
            Activity.RunOnUiThread(() =>
            {
                try
                {
                    if (image.Format == (int)ImageFormatType.Yuv420888 || image.Format == (int)ImageFormatType.Yuv422888 || image.Format == (int)ImageFormatType.Yuv444888)
                    {
                        var byteBuffer = image.GetPlanes()[0].Buffer;
                        byte[] imageData = new byte[byteBuffer.Capacity()];
                        byteBuffer.Get(imageData);

                        PlanarYUVLuminanceSource source = new PlanarYUVLuminanceSource(imageData, image.Width, image.Height, 0, 0, image.Width, image.Height, false);

                        BinaryBitmap binaryBitmap = new BinaryBitmap(new HybridBinarizer(source));
                        try
                        {
                            var result = new QRCodeMultiReader().Decode(binaryBitmap);
                            Listener.OnQrCodeFound(result?.Text);
                        }
                        catch (FormatException ex)
                        {
                            Console.WriteLine(ex);
                            //Methods.DisplayReportResultTrack(ex);
                            Listener.QrCodeNotFound();
                        }
                        catch (ChecksumException ex)
                        {
                            Console.WriteLine(ex);
                            //Methods.DisplayReportResultTrack(ex);
                            Listener.QrCodeNotFound();
                        }
                        catch (NotFoundException ex)
                        {
                            Console.WriteLine(ex);
                            //Methods.DisplayReportResultTrack(ex);
                            Listener.QrCodeNotFound();
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine(ex);
                            //Methods.DisplayReportResultTrack(ex);
                            Listener.QrCodeNotFound();
                        }
                    }

                    image.Close();
                }
                catch (Exception e)
                {
                    Methods.DisplayReportResultTrack(e);
                }
            });
        }
    }
}