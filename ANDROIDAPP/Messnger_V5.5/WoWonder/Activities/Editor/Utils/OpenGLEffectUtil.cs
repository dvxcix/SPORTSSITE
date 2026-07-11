using Android.Graphics;
using Android.Media.Effect;
using Android.Opengl;
using JA.Burhanrashid52.Photoeditor;
using Java.Nio;
using System;
using WoWonder.Helpers.Utils;

namespace WoWonder.Activities.Editor.Utils
{
    public class OpenGlEffectUtil
    {
        private readonly EffectContext EffectContext;
        private readonly EffectFactory EffectFactory;

        public OpenGlEffectUtil()
        {
            try
            {
                // Initialize EffectContext and EffectFactory
                EffectContext = EffectContext.CreateWithCurrentGlContext();
                EffectFactory = EffectContext.Factory;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public Bitmap ApplyEffect(Bitmap src, PhotoFilter filterType)
        {
            try
            {
                // Step 1: Convert Bitmap to OpenGL texture
                int textureId = CreateTextureFromBitmap(src);

                // Step 2: Apply effect using OpenGL texture
                Bitmap outputBitmap = ApplyEffectToTexture(textureId, src.Width, src.Height, filterType);

                // Step 3: Return the result as a Bitmap
                return outputBitmap;

            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return src;
            }
        }

        private int CreateTextureFromBitmap(Bitmap bitmap)
        {
            int[] texture = new int[1];
            try
            {
                GLES20.GlGenTextures(1, texture, 0);
                GLES20.GlBindTexture(GLES20.GlTexture2d, texture[0]);

                GLES20.GlTexParameteri(GLES20.GlTexture2d, GLES20.GlTextureMinFilter, GLES20.GlLinear);
                GLES20.GlTexParameteri(GLES20.GlTexture2d, GLES20.GlTextureMagFilter, GLES20.GlLinear);

                GLUtils.TexImage2D(GLES20.GlTexture2d, 0, bitmap, 0);

                return texture[0];
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return texture[0];
            }
        }

        private Bitmap ApplyEffectToTexture(int inputTexId, int width, int height, PhotoFilter filterType)
        {
            try
            {
                Bitmap outputBitmap = Bitmap.CreateBitmap(width, height, Bitmap.Config.Argb8888);

                // Create an OpenGL framebuffer to store the result
                int[] framebuffer = new int[1];
                GLES20.GlGenFramebuffers(1, framebuffer, 0);
                GLES20.GlBindFramebuffer(GLES20.GlFramebuffer, framebuffer[0]);

                // Step 4: Apply the effect
                Effect effect = null;
                if (filterType == PhotoFilter.AutoFix)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectAutofix);
                    effect.SetParameter("scale", 0.5f);
                }
                else if (filterType == PhotoFilter.BlackWhite)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectBlackwhite);
                    effect.SetParameter("black", .1f);
                    effect.SetParameter("white", .7f);
                }
                else if (filterType == PhotoFilter.Brightness)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectBrightness);
                    effect.SetParameter("brightness", 2.0f);
                }
                else if (filterType == PhotoFilter.Contrast)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectContrast);
                    effect.SetParameter("contrast", 1.4f);
                }
                else if (filterType == PhotoFilter.CrossProcess)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectCrossprocess);
                }
                else if (filterType == PhotoFilter.Documentary)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectDocumentary);
                }
                else if (filterType == PhotoFilter.DueTone)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectDuotone);
                    effect.SetParameter("first_color", Color.Yellow.ToArgb());
                    effect.SetParameter("second_color", Color.DarkGray.ToArgb());
                }
                else if (filterType == PhotoFilter.FillLight)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectFilllight);
                    effect.SetParameter("strength", .8f);
                }
                else if (filterType == PhotoFilter.FishEye)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectFisheye);
                    effect.SetParameter("scale", .5f);
                }
                else if (filterType == PhotoFilter.FlipHorizontal)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectFlip);
                    effect.SetParameter("horizontal", true);
                }
                else if (filterType == PhotoFilter.FlipVertical)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectFlip);
                    effect.SetParameter("vertical", true);
                }
                else if (filterType == PhotoFilter.Grain)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectGrain);
                    effect.SetParameter("strength", 1.0f);
                }
                else if (filterType == PhotoFilter.GrayScale)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectGrayscale);
                }
                else if (filterType == PhotoFilter.Lomish)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectLomoish);
                }
                else if (filterType == PhotoFilter.Negative)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectNegative);
                }
                else if (filterType == PhotoFilter.None)
                {
                }
                else if (filterType == PhotoFilter.Posterize)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectPosterize);
                }
                else if (filterType == PhotoFilter.Rotate)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectRotate);
                    effect.SetParameter("angle", 180);
                }
                else if (filterType == PhotoFilter.Saturate)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectSaturate);
                    effect.SetParameter("scale", .5f);
                }
                else if (filterType == PhotoFilter.Sepia)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectSepia);
                }
                else if (filterType == PhotoFilter.Sharpen)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectSharpen);
                }
                else if (filterType == PhotoFilter.Temperature)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectTemperature);
                    effect.SetParameter("scale", .9f);
                }
                else if (filterType == PhotoFilter.Tint)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectTint);
                    effect.SetParameter("tint", Color.Magenta.ToArgb());
                }
                else if (filterType == PhotoFilter.Vignette)
                {
                    effect = EffectFactory.CreateEffect(EffectFactory.EffectVignette);
                    effect.SetParameter("scale", .5f);
                }
                else
                {
                    return Bitmap.CreateBitmap(width, height, Bitmap.Config.Argb8888);  // No effect applied
                }

                int outputTexId = CreateTextureFromBitmap(outputBitmap);  // Create output texture

                // Apply the effect to the texture
                effect.Apply(inputTexId, width, height, outputTexId);

                // Step 5: Retrieve the result back into a Bitmap
                // You would read back the texture data into the bitmap (this part involves OpenGL rendering)
                ReadPixelsFromTexture(outputTexId, outputBitmap);

                return outputBitmap;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return Bitmap.CreateBitmap(width, height, Bitmap.Config.Argb8888);  // No effect applied
            }
        }

        private void ReadPixelsFromTexture(int textureId, Bitmap bitmap)
        {
            try
            {
                GLES20.GlBindTexture(GLES20.GlTexture2d, textureId);

                // Allocate a ByteBuffer to hold the pixel data
                ByteBuffer buffer = ByteBuffer.AllocateDirect(4 * bitmap.Width * bitmap.Height);
                buffer.Order(ByteOrder.NativeOrder());

                // Read the pixels from the OpenGL texture into the buffer
                GLES20.GlReadPixels(0, 0, bitmap.Width, bitmap.Height, GLES20.GlRgba, GLES20.GlUnsignedByte, buffer);

                // Flip the buffer so it can be used
                buffer.Flip();

                // Copy the buffer into the Bitmap's pixels
                buffer.Rewind();
                bitmap.CopyPixelsFromBuffer(buffer);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

    }
}
