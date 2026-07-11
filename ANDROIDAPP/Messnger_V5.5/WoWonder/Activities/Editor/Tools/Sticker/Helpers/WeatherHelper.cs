using Android.App;
using Newtonsoft.Json.Linq;
using System;
using System.Net.Http;
using WoWonder.Helpers.Utils;

namespace WoWonder.Activities.Editor.Tools.Sticker.Helpers
{
    public class WeatherHelper
    {
        /// <summary>
        /// https://www.weatherapi.com
        /// </summary>
        private readonly string ApiKey = "a413d0bf31a44369a16140106221804"; // Replace with your API key

        private readonly Activity ActivityContext;
        private readonly IOnSelectWeatherListener OnSelectWeatherListener;

        public interface IOnSelectWeatherListener
        {
            void OnSelectWeather(string temperature);
        }

        public WeatherHelper(Activity context, IOnSelectWeatherListener listener)
        {
            try
            {
                ActivityContext = context;
                OnSelectWeatherListener = listener;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public async void GetCurrentWeather(double latitude, double longitude)
        {
            try
            {
                var client = new HttpClient();
                var response = await client.GetAsync("https://api.weatherapi.com/v1/current.json?key=" + ApiKey + "&q=" + latitude + "," + longitude + "&lang=en");
                string json = await response.Content.ReadAsStringAsync();
                string current = JObject.Parse(json)["current"]?.ToString() ?? "";
                if (!string.IsNullOrEmpty(current))
                {
                    string tempC = JObject.Parse(current)["temp_c"]?.ToString() ?? "";
                    if (!string.IsNullOrEmpty(tempC))
                    {
                        OnSelectWeatherListener?.OnSelectWeather(tempC);
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }
}
