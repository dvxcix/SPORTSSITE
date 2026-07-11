using Android.App;
using Android.Content;
using System;
using WoWonder.Helpers.Utils;

namespace WoWonder.Activities.Editor.Tools.Sticker.Helpers
{
    public class BatteryHelper : BroadcastReceiver
    {
        private Activity ActivityContext;
        private IBatteryListener BatteryListener;

        public interface IBatteryListener
        {
            void OnSelectBattery(int level);
        }

        public void GetBattery(Activity context, IBatteryListener listener)
        {
            try
            {
                ActivityContext = context;
                BatteryListener = listener;

                IntentFilter intentFilter = new IntentFilter(Intent.ActionBatteryChanged);
                ActivityContext.RegisterReceiver(this, intentFilter);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override void OnReceive(Context context, Intent intent)
        {
            try
            {
                int level = intent.GetIntExtra("level", 0);
                BatteryListener?.OnSelectBattery(level);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }
}
