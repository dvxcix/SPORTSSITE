using Android;
using Android.App;
using Android.Content.PM;
using Android.Locations;
using Android.OS;
using AndroidX.Core.App;
using AndroidX.Core.Content;
using Java.Util;
using System;
using System.Linq;
using WoWonder.Helpers.Utils;
using Context = Android.Content.Context;

namespace WoWonder.Activities.Editor.Tools.Sticker.Helpers
{

    public class LocationHelper : Java.Lang.Object, ILocationListener
    {
        private readonly Activity ActivityContext;
        private readonly LocationManager LocationManager;
        private string CountryName = "";
        private readonly IOnSelectLocationListener OnSelectLocationListener;

        public interface IOnSelectLocationListener
        {
            void OnSelectLocation(Location location, string countryName);
        }

        public LocationHelper(Activity context, IOnSelectLocationListener listener)
        {
            try
            {
                ActivityContext = context;
                OnSelectLocationListener = listener;
                LocationManager = (LocationManager)context.GetSystemService(Context.LocationService);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void GetCurrentLocation()
        {
            try
            {
                if (ContextCompat.CheckSelfPermission(ActivityContext, Manifest.Permission.AccessFineLocation) != Permission.Granted)
                {
                    ActivityCompat.RequestPermissions(ActivityContext, new string[] { Manifest.Permission.AccessFineLocation }, 106);
                    return;
                }

                LocationManager.RequestLocationUpdates(LocationManager.GpsProvider, 5000, 10, this);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnLocationChanged(Location location)
        {
            try
            {
                CountryName = GetCountryName(location.Latitude, location.Longitude);
                OnSelectLocationListener?.OnSelectLocation(location, CountryName);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnProviderDisabled(string provider)
        {

        }

        public void OnProviderEnabled(string provider)
        {

        }

        public void OnStatusChanged(string provider, Availability status, Bundle extras)
        {

        }

        private string GetCountryName(double latitude, double longitude)
        {
            Geocoder geoCoder = new Geocoder(ActivityContext, Locale.Default);
            try
            {
                var addresses = geoCoder.GetFromLocation(latitude, longitude, 1);
                if (addresses != null && addresses.Count > 0)
                {
                    return addresses.FirstOrDefault()?.CountryName;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
            return CountryName;
        }
    }
}
