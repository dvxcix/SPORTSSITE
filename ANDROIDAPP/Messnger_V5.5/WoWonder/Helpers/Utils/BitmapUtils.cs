using Android.Content;
using Android.Content.Res;
using Android.Graphics;
using Android.Graphics.Drawables;
using Android.Opengl;
using Android.Views;
using Android.Widget;
using Java.Lang;
using Java.Nio;
using Javax.Microedition.Khronos.Opengles;
using System;
using System.Net.Http;
using System.Threading.Tasks;
using Exception = System.Exception;

namespace WoWonder.Helpers.Utils
{
    public class BitmapUtils
    {
        /// <summary>
        /// Save filter bitmap from
        /// </summary>
        /// <param name="glSurfaceView"> surface view on which is image is drawn </param>
        /// <param name="gl">            open gl source to read pixels from <seealso cref="GLSurfaceView"/> </param>
        /// <returns> save bitmap </returns>
        /// <exception cref="OutOfMemoryError"> error when system is out of memory to load and save bitmap </exception>
        internal static Bitmap CreateBitmapFromGlSurface(GLSurfaceView glSurfaceView, IGL10 gl)
        {
            int x = 0, y = 0;
            int w = glSurfaceView.Width;
            int h = glSurfaceView.Height;
            int[] bitmapBuffer = new int[w * h];
            int[] bitmapSource = new int[w * h];
            IntBuffer intBuffer = IntBuffer.Wrap(bitmapBuffer);
            intBuffer.Position(0);

            try
            {
                gl.GlReadPixels(x, y, w, h, IGL10.GlRgba, IGL10.GlUnsignedByte, intBuffer);
                int offset1, offset2;
                for (int i = 0; i < h; i++)
                {
                    offset1 = i * w;
                    offset2 = (h - i - 1) * w;
                    for (int j = 0; j < w; j++)
                    {
                        int texturePixel = bitmapBuffer[offset1 + j];
                        int blue = texturePixel >> 16 & 0xff;
                        int red = texturePixel << 16 & 0x00ff0000;
                        int pixel = texturePixel & unchecked((int)0xff00ff00) | red | blue;
                        bitmapSource[offset2 + j] = pixel;
                    }
                }
            }
            catch (GLException)
            {
                return null;
            }
            return Bitmap.CreateBitmap(bitmapSource, w, h, Bitmap.Config.Argb8888);
        }
        /// <summary>
        ///     Getting bitmap from Assets folder
        /// </summary>
        /// <param name="context"></param>
        /// <param name="strName"></param>
        /// <returns></returns>
        public static Bitmap GetBitmapFromAsset(Context context, string strName)
        {
            var assetManager = context.Assets;
            try
            {
                var istr = assetManager.Open(strName, Access.Streaming);
                return BitmapFactory.DecodeStream(istr);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return null!;
            }
        }

        public static Bitmap ConvertToBitmap(Drawable drawable, int widthPixels, int heightPixels)
        {
            try
            {
                var mutableBitmap = Bitmap.CreateBitmap(widthPixels, heightPixels, Bitmap.Config.Argb8888);
                var canvas = new Canvas(mutableBitmap);
                drawable.SetBounds(0, 0, widthPixels, heightPixels);
                drawable.Draw(canvas);

                return mutableBitmap;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return null!;
            }
        }

        public static Bitmap LoadBitmapFromColor(Color color, int widthPixels, int heightPixels)
        {
            try
            {
                Bitmap bmp = Bitmap.CreateBitmap(widthPixels, heightPixels, Bitmap.Config.Argb8888);
                Canvas canvas = new Canvas(bmp);
                canvas.DrawColor(color);
                return bmp;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return null!;
            }
        }

        public static Bitmap LoadBitmapFromView(View v, int widthPixels, int heightPixels)
        {
            try
            {
                if (v.MeasuredHeight <= 0)
                    v.Measure(widthPixels, heightPixels);

                var b = Bitmap.CreateBitmap(widthPixels, heightPixels, Bitmap.Config.Argb8888, true);
                var c = new Canvas(b);
                c.DrawColor(Color.Transparent);
                v.Layout(0, 0, widthPixels, heightPixels);
                v.Draw(c);
                return b;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return null!;
            }
        }

        public static async Task<Bitmap> GetImageBitmapFromUrl(string url)
        {
            try
            {
                if (url.Contains("http"))
                {
                    if (Methods.CheckConnectivity())
                    {
                        HttpClient client = new HttpClient();

                        var imageBytes = await client.GetByteArrayAsync(new Uri(url));
                        if (imageBytes is { Length: > 0 })
                            return await BitmapFactory.DecodeByteArrayAsync(imageBytes, 0, imageBytes.Length);
                    }
                }
                else
                {
                    //BitmapFactory.Options bmOptions = new BitmapFactory.Options();
                    return await BitmapFactory.DecodeFileAsync(url);
                }

                return null!;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return null!;
            }
        }

        public static Bitmap GetImageBitmapFromImageView(ImageView imageView)
        {
            try
            {
                Drawable drawable = imageView.Drawable;

                if (drawable is BitmapDrawable bitmapDrawable)
                {
                    return bitmapDrawable.Bitmap;
                }
                else
                {
                    Bitmap bitmap = Bitmap.CreateBitmap(drawable.IntrinsicWidth, drawable.IntrinsicHeight, Bitmap.Config.Argb8888);
                    Canvas canvas = new Canvas(bitmap);
                    drawable.SetBounds(0, 0, canvas.Width, canvas.Height);
                    drawable.Draw(canvas);
                    return bitmap!;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return null!;
            }
        }


    }
}