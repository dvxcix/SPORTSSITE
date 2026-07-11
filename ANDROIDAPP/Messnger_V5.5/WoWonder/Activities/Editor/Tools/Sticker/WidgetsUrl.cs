using Android.Graphics;
using Android.Locations;
using Android.Text;
using Android.Views;
using Android.Widget;
using Google.Android.Material.Dialog;
using JA.Burhanrashid52.Photoeditor;
using Java.Util;
using System;
using System.Collections.Generic;
using WoWonder.Activities.Editor.Model;
using WoWonder.Activities.Editor.Tools.Sticker.Helpers;
using WoWonder.Helpers.Utils;
using Activity = Android.App.Activity;

namespace WoWonder.Activities.Editor.Tools.Sticker
{
    public class WidgetsUrl : LocationHelper.IOnSelectLocationListener, WeatherHelper.IOnSelectWeatherListener, BatteryHelper.IBatteryListener
    {
        public List<StickersModel> WidgetList = new List<StickersModel>();
        private Activity ActivityContext;

        private static volatile WidgetsUrl _instanceRenamed;
        public static WidgetsUrl Instance
        {
            get
            {
                WidgetsUrl localInstance = _instanceRenamed;
                if (localInstance == null)
                {
                    lock (typeof(WidgetsUrl))
                    {
                        localInstance = _instanceRenamed;
                        if (localInstance == null)
                        {
                            _instanceRenamed = localInstance = new WidgetsUrl();
                        }
                    }
                }
                return localInstance;
            }
        }

        public void GetWidgets(Activity context)
        {
            try
            {
                ActivityContext = context;
                WidgetList = new List<StickersModel>();

                GetLocation(context);
                GetTime(context);
                GetCurrentDay(context);
                GetBattery(context);
                GetMoonPhase(context);
                GetHashtags(context);
                GetCustomQuotes(context);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void GetLocation(Activity context)
        {
            try
            {
                LocationHelper helper = new LocationHelper(context, this);
                helper.GetCurrentLocation();
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
            }
        }

        private void GetTime(Activity context)
        {
            try
            {
                // Get Date & Time
                DateTime time = DateTime.Now;
                string currentDateTime = time.ToShortTimeString();

                var tvDateTime = "🕒 " + currentDateTime;

                var itemView = LayoutInflater.From(context)?.Inflate(Resource.Layout.widget_text_view, null);
                if (itemView != null)
                {
                    var text = itemView.FindViewById<TextView>(Resource.Id.txt_widget);
                    text.Text = tvDateTime;

                    // Save the Image  
                    var bit = BitmapUtils.LoadBitmapFromView(itemView, PixelUtil.TextSizeDp(context, 170), PixelUtil.TextSizeDp(context, 60));
                    if (bit != null)
                    {
                        var check = WidgetList.Find(q => q.Content == "Time");
                        if (check == null)
                        {
                            WidgetList.Add(new StickersModel()
                            {
                                Id = WidgetList.Count + 1,
                                Image = bit,
                                ItemSelected = false,
                                Type = StickersType.Widget,
                                Content = "Time"
                            });
                        }

                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void GetCurrentDay(Activity context)
        {
            try
            {
                // Get Date & Time 
                DateTime time = DateTime.Now;
                Calendar calendar = Calendar.Instance;
                int dayOfWeek = calendar.Get(CalendarField.DayOfWeek);

                string[] days = { "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" };
                string currentDay = days[dayOfWeek - 1]; // Calendar starts from Sunday (1)

                var itemView = LayoutInflater.From(context)?.Inflate(Resource.Layout.widget_text_view, null);
                if (itemView != null)
                {
                    var text = itemView.FindViewById<TextView>(Resource.Id.txt_widget);
                    text.Text = currentDay;

                    // Save the Image  
                    var bit = BitmapUtils.LoadBitmapFromView(itemView, PixelUtil.TextSizeDp(context, 170), PixelUtil.TextSizeDp(context, 60));
                    if (bit != null)
                    {
                        var check = WidgetList.Find(q => q.Content == "Day");
                        if (check == null)
                        {
                            WidgetList.Add(new StickersModel()
                            {
                                Id = WidgetList.Count + 1,
                                Image = bit,
                                ItemSelected = false,
                                Type = StickersType.Widget,
                                Content = "Day"
                            });
                        }

                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void GetHashtags(Activity context)
        {
            try
            {
                var itemView = LayoutInflater.From(context)?.Inflate(Resource.Layout.widget_text_view, null);
                if (itemView != null)
                {
                    var text = itemView.FindViewById<TextView>(Resource.Id.txt_widget);
                    text.Text = "# HASHTAG";

                    // Save the Image  
                    var bit = BitmapUtils.LoadBitmapFromView(itemView, PixelUtil.TextSizeDp(context, 180), PixelUtil.TextSizeDp(context, 55));
                    if (bit != null)
                    {
                        var check = WidgetList.Find(q => q.Content == "Hashtags");
                        if (check == null)
                        {
                            WidgetList.Add(new StickersModel()
                            {
                                Id = WidgetList.Count + 1,
                                Image = bit,
                                ItemSelected = false,
                                Type = StickersType.Widget,
                                Content = "Hashtags"
                            });
                        }
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void GetCustomQuotes(Activity context)
        {
            try
            {
                var list = new List<string>
                {
                    "Believe in yourself 💪",
                    "You got this! ✨",
                    "Happy New Year 🎉",
                    "Merry Christmas 🎄",
                    "Wanderlust ✈️",
                    "Beach Vibes 🌊",
                };

                for (int i = 0; i < list.Count; i++)
                {
                    var textQuotes = list[i];
                    var itemView = LayoutInflater.From(context)?.Inflate(Resource.Layout.widget_text_view, null);
                    if (itemView != null)
                    {
                        var text = itemView.FindViewById<TextView>(Resource.Id.txt_widget);
                        text.Text = textQuotes;

                        // Save the Image  
                        var bit = BitmapUtils.LoadBitmapFromView(itemView, PixelUtil.TextSizeDp(context, 190), PixelUtil.TextSizeDp(context, 55));
                        if (bit != null)
                        {
                            var check = WidgetList.Find(q => q.Content == "CustomQuotes" + i);
                            if (check == null)
                            {
                                WidgetList.Add(new StickersModel()
                                {
                                    Id = WidgetList.Count + 1,
                                    Image = bit,
                                    ItemSelected = false,
                                    Type = StickersType.Widget,
                                    Content = "CustomQuotes" + i
                                });
                            }
                        }
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void GetMoonPhase(Activity context)
        {
            try
            {
                var moonPhase = MoonPhaseCalculator.GetMoonPhase();
                var itemView = LayoutInflater.From(context)?.Inflate(Resource.Layout.widget_text_view, null);
                if (itemView != null)
                {
                    var text = itemView.FindViewById<TextView>(Resource.Id.txt_widget);
                    text.Text = moonPhase;

                    // Save the Image  
                    var bit = BitmapUtils.LoadBitmapFromView(itemView, PixelUtil.TextSizeDp(context, 170), PixelUtil.TextSizeDp(context, 55));
                    if (bit != null)
                    {
                        var check = WidgetList.Find(q => q.Content == "MoonPhase");
                        if (check == null)
                        {
                            WidgetList.Add(new StickersModel()
                            {
                                Id = WidgetList.Count + 1,
                                Image = bit,
                                ItemSelected = false,
                                Type = StickersType.Widget,
                                Content = "MoonPhase"
                            });
                        }
                    }
                }
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
            }
        }

        private void GetBattery(Activity context)
        {
            try
            {
                BatteryHelper helper = new BatteryHelper();
                helper.GetBattery(context, this);
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
            }
        }

        #region Listener

        public void OnSelectLocation(Location location, string countryName)
        {
            try
            {
                if (!string.IsNullOrEmpty(countryName))
                {
                    var locationText = "📍 " + countryName.ToUpper();

                    var itemView = LayoutInflater.From(ActivityContext)?.Inflate(Resource.Layout.widget_text_view, null);
                    if (itemView != null)
                    {
                        var text = itemView.FindViewById<TextView>(Resource.Id.txt_widget);
                        text.Text = locationText;

                        // Save the Image  
                        var bit = BitmapUtils.LoadBitmapFromView(itemView, PixelUtil.TextSizeDp(ActivityContext, 180), PixelUtil.TextSizeDp(ActivityContext, 60));
                        if (bit != null)
                        {
                            var check = WidgetList.Find(q => q.Content == "Location");
                            if (check == null)
                            {
                                WidgetList.Add(new StickersModel()
                                {
                                    Id = WidgetList.Count + 1,
                                    Image = bit,
                                    ItemSelected = false,
                                    Type = StickersType.Widget,
                                    Content = "Location"
                                });
                            }
                        }
                    }
                }

                WeatherHelper weather = new WeatherHelper(ActivityContext, this);
                weather.GetCurrentWeather(location.Latitude, location.Longitude);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnSelectWeather(string temperature)
        {
            try
            {
                if (!string.IsNullOrEmpty(temperature))
                {
                    var weatherText = "🌡 " + temperature + "°C";

                    var itemView = LayoutInflater.From(ActivityContext)?.Inflate(Resource.Layout.widget_text_view, null);
                    if (itemView != null)
                    {
                        var text = itemView.FindViewById<TextView>(Resource.Id.txt_widget);
                        text.Text = weatherText;

                        // Save the Image  
                        var bit = BitmapUtils.LoadBitmapFromView(itemView, PixelUtil.TextSizeDp(ActivityContext, 150), PixelUtil.TextSizeDp(ActivityContext, 60));
                        if (bit != null)
                        {
                            var check = WidgetList.Find(q => q.Content == "Weather");
                            if (check == null)
                            {
                                WidgetList.Add(new StickersModel()
                                {
                                    Id = WidgetList.Count + 1,
                                    Image = bit,
                                    ItemSelected = false,
                                    Type = StickersType.Widget,
                                    Content = "Weather"
                                });
                            }
                        }
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnSelectBattery(int level)
        {
            try
            {
                if (level > 0)
                {
                    var batteryText = "🔋 Battery: " + level + "%";

                    var itemView = LayoutInflater.From(ActivityContext)?.Inflate(Resource.Layout.widget_text_view, null);
                    if (itemView != null)
                    {
                        var text = itemView.FindViewById<TextView>(Resource.Id.txt_widget);
                        text.Text = batteryText;

                        // Save the Image  
                        var bit = BitmapUtils.LoadBitmapFromView(itemView, PixelUtil.TextSizeDp(ActivityContext, 170), PixelUtil.TextSizeDp(ActivityContext, 60));
                        if (bit != null)
                        {
                            var check = WidgetList.Find(q => q.Content == "Battery");
                            if (check == null)
                            {
                                WidgetList.Add(new StickersModel()
                                {
                                    Id = WidgetList.Count + 1,
                                    Image = bit,
                                    ItemSelected = false,
                                    Type = StickersType.Widget,
                                    Content = "Battery"
                                });
                            }
                        }
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        #endregion

        public void AddCustomHashtags(Activity context, IPhotoEditor photoEditor)
        {
            try
            {
                var dialog = new MaterialAlertDialogBuilder(context);
                EditText input = new EditText(context);
                input.SetHint(Resource.String.Lbl_Hashtag);
                input.InputType = InputTypes.TextFlagImeMultiLine;
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MatchParent, ViewGroup.LayoutParams.WrapContent);
                lp.SetMargins(10, 10, 10, 10);
                input.LayoutParameters = lp;

                dialog.SetView(input);
                dialog.SetTitle(context.GetText(Resource.String.Lbl_AddHashtag));
                dialog.SetPositiveButton(context.GetText(Resource.String.Lbl_Done), (materialDialog, action) =>
                {
                    try
                    {
                        if (input.Length() == 0)
                            return;

                        var itemView = LayoutInflater.From(context)?.Inflate(Resource.Layout.widget_text_view, null);
                        if (itemView != null)
                        {
                            var text = itemView.FindViewById<TextView>(Resource.Id.txt_widget);
                            text.Text = "#" + input.Text?.Trim();

                            // Save the Image  
                            Bitmap bit = BitmapUtils.LoadBitmapFromView(itemView, PixelUtil.TextSizeDp(context, 180), PixelUtil.TextSizeDp(context, 60));
                            if (bit != null)
                            {
                                photoEditor.AddImage(bit);
                            }
                        }
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

    }
}