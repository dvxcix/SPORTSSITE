using Android.Content;
using Android.Graphics;
using Android.Renderscripts;
using JA.Burhanrashid52.Photoeditor;
using System;
using WoWonder.Helpers.Utils;

namespace WoWonder.Activities.Editor.Utils
{
    public class FilterUtils
    {
        public static Bitmap ApplyFilterToBitmap(Context context, Bitmap original, PhotoFilter filter)
        {
            try
            {
                Bitmap filteredBitmap = Bitmap.CreateBitmap(original.Width, original.Height, original.GetConfig());
                Canvas canvas = new Canvas(filteredBitmap);
                Paint paint = new Paint();

                ColorMatrix colorMatrix = new ColorMatrix();

                if (filter == PhotoFilter.None)
                {
                    return original; // No filter, return original
                }
                else if (filter == PhotoFilter.AutoFix)
                {
                    ApplyAutoAdjust(original); // Auto-fix  
                }
                else if (filter == PhotoFilter.BlackWhite)
                {
                    colorMatrix.SetSaturation(0); // Convert to black and white
                }
                else if (filter == PhotoFilter.Brightness)
                {
                    colorMatrix.Set(new float[]
                    {
                        1.2f, 0, 0, 0, 50,
                        0, 1.2f, 0, 0, 50,
                        0, 0, 1.2f, 0, 50,
                        0, 0, 0, 1, 0
                    });
                }
                else if (filter == PhotoFilter.Contrast)
                {
                    float contrast = 1.5f;
                    float translate = (-0.5f * contrast + 0.5f) * 255;
                    colorMatrix.Set(new float[]
                    {
                        contrast, 0, 0, 0, translate,
                        0, contrast, 0, 0, translate,
                        0, 0, contrast, 0, translate,
                        0, 0, 0, 1, 0
                    });
                }
                else if (filter == PhotoFilter.CrossProcess)
                {
                    colorMatrix.Set(new float[]
                    {
                        1.5f, 0, 0, 0, -100,
                        0, 1.2f, 0, 0, 50,
                        0, 0, 1.8f, 0, -100,
                        0, 0, 0, 1, 0
                    });
                }
                else if (filter == PhotoFilter.Documentary)
                {
                    colorMatrix.SetSaturation(0.5f); // Reduce saturation for a "documentary" look
                }
                else if (filter == PhotoFilter.DueTone)
                {
                    colorMatrix.Set(new float[]
                    {
                        1.0f, 0.2f, 0.2f, 0, 0,
                        0.2f, 1.0f, 0.2f, 0, 0,
                        0.2f, 0.2f, 1.0f, 0, 0,
                        0, 0, 0, 1, 0
                    });
                }
                else if (filter == PhotoFilter.FillLight)
                {
                    colorMatrix.Set(new float[]
                    {
                        1.0f, 0, 0, 0, 30,
                        0, 1.0f, 0, 0, 30,
                        0, 0, 1.0f, 0, 30,
                        0, 0, 0, 1, 0
                    });
                }
                else if (filter == PhotoFilter.FishEye)
                {
                    // Fish eye distortion is complex and requires OpenGL or shader logic
                    return ApplyFishEyeEffect(original);
                }
                else if (filter == PhotoFilter.FlipVertical)
                {
                    return FlipBitmap(original, true);
                }
                else if (filter == PhotoFilter.FlipHorizontal)
                {
                    return FlipBitmap(original, false);
                }
                else if (filter == PhotoFilter.Grain)
                {
                    return AddGrainEffect(original);
                }
                else if (filter == PhotoFilter.GrayScale)
                {
                    colorMatrix.SetSaturation(0);
                }
                else if (filter == PhotoFilter.Lomish)
                {
                    colorMatrix.Set(new float[]
                    {
                        1.2f, 0, 0, 0, 30,
                        0, 1.1f, 0, 0, 20,
                        0, 0, 1.0f, 0, 15,
                        0, 0, 0, 1, 0
                    });
                }
                else if (filter == PhotoFilter.Negative)
                {
                    colorMatrix.Set(new float[]
                    {
                        -1, 0, 0, 0, 255,
                        0, -1, 0, 0, 255,
                        0, 0, -1, 0, 255,
                        0, 0, 0, 1, 0
                    });
                }
                else if (filter == PhotoFilter.Posterize)
                {
                    return PosterizeBitmap(original, 4);
                }
                else if (filter == PhotoFilter.Rotate)
                {
                    return RotateBitmap(original, 90);
                }
                else if (filter == PhotoFilter.Saturate)
                {
                    colorMatrix.SetSaturation(1.5f);
                }
                else if (filter == PhotoFilter.Sepia)
                {
                    colorMatrix.Set(new float[]
                    {
                        0.393f, 0.769f, 0.189f, 0, 0,
                        0.349f, 0.686f, 0.168f, 0, 0,
                        0.272f, 0.534f, 0.131f, 0, 0,
                        0, 0, 0, 1, 0
                    });
                }
                else if (filter == PhotoFilter.Sharpen)
                {
                    // Use OpenGL or convolution matrix for advanced sharpening
                    return ApplySharpenEffect(context, original);
                }
                else if (filter == PhotoFilter.Temperature)
                {
                    colorMatrix.SetScale(1.2f, 1.1f, 0.9f, 1.0f); // Warmer tones
                }
                else if (filter == PhotoFilter.Tint)
                {
                    colorMatrix.Set(new float[]
                    {
                        1.0f, 0.2f, 0.2f, 0, 0,
                        0.2f, 1.0f, 0.2f, 0, 0,
                        0.2f, 0.2f, 1.0f, 0, 0,
                        0, 0, 0, 1, 0
                    });
                }
                else if (filter == PhotoFilter.Vignette)
                {
                    return ApplyVignetteEffect(original);
                }
                else
                {
                    return original;
                }

                paint.SetColorFilter(new ColorMatrixColorFilter(colorMatrix));
                canvas.DrawBitmap(original, 0, 0, paint);

                return filteredBitmap;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return original;
            }
        }

        private static Bitmap ApplyAutoAdjust(Bitmap src)
        {
            try
            {
                // Create a ColorMatrix to Apply adjustments
                ColorMatrix colorMatrix = new ColorMatrix();

                // Increase contrast (scale values)
                float contrast = 1.2f; // Adjust this value (1.0 = no change)
                float scale = contrast;
                float translate = (-0.5f * scale + 0.5f) * 255f;

                // Contrast matrix
                ColorMatrix contrastMatrix = new ColorMatrix(new float[]{
                    scale, 0, 0, 0, translate,
                    0, scale, 0, 0, translate,
                    0, 0, scale, 0, translate,
                    0, 0, 0, 1, 0
                });

                // Apply contrast
                colorMatrix.PostConcat(contrastMatrix);

                // Increase brightness (shift values)
                float brightness = 20f; // Adjust this value (0 = no change)
                ColorMatrix brightnessMatrix = new ColorMatrix(new float[]{
                    1, 0, 0, 0, brightness,
                    0, 1, 0, 0, brightness,
                    0, 0, 1, 0, brightness,
                    0, 0, 0, 1, 0
                });

                // Apply brightness
                colorMatrix.PostConcat(brightnessMatrix);

                // Increase saturation
                float saturation = 1.5f; // Adjust this value (1.0 = no change)
                ColorMatrix saturationMatrix = new ColorMatrix();
                saturationMatrix.SetSaturation(saturation);

                // Apply saturation
                colorMatrix.PostConcat(saturationMatrix);

                // Apply the color matrix to the bitmap
                Bitmap output = Bitmap.CreateBitmap(src.Width, src.Height, src.GetConfig());
                Canvas canvas = new Canvas(output);
                Paint paint = new Paint();
                paint.SetColorFilter(new ColorMatrixColorFilter(colorMatrix));
                canvas.DrawBitmap(src, 0, 0, paint);

                return output;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return src;
            }
        }

        private static Bitmap FlipBitmap(Bitmap src, bool vertical)
        {
            try
            {
                Matrix matrix = new Matrix();
                if (vertical)
                {
                    matrix.PreScale(1.0f, -1.0f);
                }
                else
                {
                    matrix.PreScale(-1.0f, 1.0f);
                }
                return Bitmap.CreateBitmap(src, 0, 0, src.Width, src.Height, matrix, true);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return src;
            }
        }

        private static Bitmap RotateBitmap(Bitmap src, float angle)
        {
            try
            {
                Matrix matrix = new Matrix();
                matrix.PostRotate(angle);
                return Bitmap.CreateBitmap(src, 0, 0, src.Width, src.Height, matrix, true);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return src;
            }
        }

        private static Bitmap AddGrainEffect(Bitmap src)
        {
            try
            {
                Bitmap grainBitmap = Bitmap.CreateBitmap(src.Width, src.Height, src.GetConfig());
                Canvas canvas = new Canvas(grainBitmap);
                Paint paint = new Paint();

                // Draw noise
                for (int y = 0; y < src.Height; y++)
                {
                    for (int x = 0; x < src.Width; x++)
                    {
                        int gray = (int)(Java.Lang.Math.Random() * 255);
                        int noiseColor = (0xFF << 24) | (gray << 16) | (gray << 8) | gray; // Random grayscale pixel
                        paint.SetColor(noiseColor);
                        canvas.DrawPoint(x, y, paint);
                    }
                }

                // Blend noise with the original image
                Paint blendPaint = new Paint();
                blendPaint.Alpha = 50; // Adjust transparency of the noise
                canvas.DrawBitmap(src, 0, 0, null);
                canvas.DrawBitmap(grainBitmap, 0, 0, blendPaint);

                return grainBitmap;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return src;
            }
        }

        private static Bitmap ApplyFishEyeEffect(Bitmap src)
        {
            try
            {
                int width = src.Width;
                int height = src.Height;
                Bitmap output = Bitmap.CreateBitmap(width, height, src.GetConfig());

                float cx = width / 2f; // Center X
                float cy = height / 2f; // Center Y
                float maxRadius = Math.Min(cx, cy);

                for (int y = 0; y < height; y++)
                {
                    for (int x = 0; x < width; x++)
                    {
                        float dx = x - cx;
                        float dy = y - cy;
                        float distance = (float)Math.Sqrt(dx * dx + dy * dy);

                        if (distance < maxRadius)
                        {
                            float r = distance / maxRadius;
                            float theta = (float)(Math.Atan2(dy, dx) + Math.Sin(5 * r) * 0.5);

                            int srcX = (int)(cx + r * maxRadius * Math.Cos(theta));
                            int srcY = (int)(cy + r * maxRadius * Math.Sin(theta));

                            if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height)
                            {
                                output.SetPixel(x, y, new Color(src.GetPixel(srcX, srcY)));
                            }
                        }
                        else
                        {
                            output.SetPixel(x, y, new Color(src.GetPixel(x, y)));
                        }
                    }
                }
                return output;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return src;
            }
        }

        private static Bitmap ApplyVignetteEffect(Bitmap src)
        {
            try
            {
                int width = src.Width;
                int height = src.Height;
                Bitmap output = Bitmap.CreateBitmap(width, height, src.GetConfig());

                // Center coordinates
                float centerX = width / 2f;
                float centerY = height / 2f;
                float radius = Math.Max(centerX, centerY);

                Canvas canvas = new Canvas(output);
                Paint paint = new Paint();
                paint.AntiAlias = true;

                // Draw the original bitmap
                canvas.DrawBitmap(src, 0, 0, null);

                // Prepare a radial gradient for the vignette
                RadialGradient gradient = new RadialGradient(
                    centerX, centerY, radius,
                    new int[] { 0x00000000, 0x00000000, unchecked((int)0xFF000000) }, // Transparent to black
                    new float[] { 0.0f, 0.7f, 1.0f }, // Gradient stops
                    Shader.TileMode.Clamp
                );

                // Apply the gradient as a mask
                paint.SetShader(gradient);
                paint.SetXfermode(new PorterDuffXfermode(PorterDuff.Mode.Overlay));
                canvas.DrawCircle(centerX, centerY, radius, paint);

                return output;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return src;
            }
        }

        private static Bitmap PosterizeBitmap(Bitmap src, int levels)
        {
            try
            {
                Bitmap output = Bitmap.CreateBitmap(src.Width, src.Height, src.GetConfig());
                int step = 256 / levels;

                for (int y = 0; y < src.Height; y++)
                {
                    for (int x = 0; x < src.Width; x++)
                    {
                        int pixel = src.GetPixel(x, y);

                        int r = (pixel >> 16) & 0xFF;
                        int g = (pixel >> 8) & 0xFF;
                        int b = pixel & 0xFF;

                        // Reduce color levels
                        r = r / step * step;
                        g = g / step * step;
                        b = b / step * step;

                        int newPixel = (0xFF << 24) | (r << 16) | (g << 8) | b;
                        output.SetPixel(x, y, new Color(newPixel));
                    }
                }
                return output;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return src;
            }
        }

        private static Bitmap ApplySharpenEffect(Context context, Bitmap src)
        {
            try
            {
                // Sharpen kernel
                float[] kernel = {
                    0, -1, 0,
                    -1, 5, -1,
                    0, -1, 0
                };

                // Convolution processing
                Bitmap output = Bitmap.CreateBitmap(src.Width, src.Height, src.GetConfig());
                RenderScript rs = RenderScript.Create(context);

                // Create input/output allocations
                Allocation input = Allocation.CreateFromBitmap(rs, src);
                Allocation outputAlloc = Allocation.CreateTyped(rs, input.Type);

                // Apply convolution
                ScriptIntrinsicConvolve3x3 convolve = ScriptIntrinsicConvolve3x3.Create(rs, Element.U8_4(rs));
                convolve.SetInput(input);
                convolve.SetCoefficients(kernel);
                convolve.ForEach(outputAlloc);

                // Copy result
                outputAlloc.CopyTo(output);
                rs.Destroy();
                return output;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return src;
            }
        }

    }
}
