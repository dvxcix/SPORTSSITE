using Android.Icu.Util;
using System;

namespace WoWonder.Activities.Editor.Tools.Sticker.Helpers
{
    public class MoonPhaseCalculator
    {
        public static string GetMoonPhase()
        {
            try
            {
                // Reference new moon date (Jan 6, 2000)
                Calendar calendar = Calendar.Instance;
                int year = calendar.Get(CalendarField.Year);
                int month = calendar.Get(CalendarField.Month) + 1; // Month is 0-based
                int day = calendar.Get(CalendarField.DayOfWeek);

                if (month < 3)
                {
                    year--;
                    month += 12;
                }

                int a = year / 100;
                int b = a / 4;
                int c = 2 - a + b;
                int e = (int)(365.25 * (year + 4716));
                int f = (int)(30.6001 * (month + 1));
                double julianDay = c + day + e + f - 1524.5;
                double daysSinceNewMoon = julianDay - 2451550.1;
                double moonCycle = daysSinceNewMoon / 29.53;
                double moonPhase = moonCycle - Math.Floor(moonCycle);

                // Determine moon phase
                if (moonPhase < 0.03) return "🌑 New Moon";
                else if (moonPhase < 0.22) return "🌒 Waxing Crescent";
                else if (moonPhase < 0.28) return "🌓 First Quarter";
                else if (moonPhase < 0.47) return "🌔 Waxing Gibbous";
                else if (moonPhase < 0.53) return "🌕 Full Moon";
                else if (moonPhase < 0.72) return "🌖 Waning Gibbous";
                else if (moonPhase < 0.78) return "🌗 Last Quarter";
                else return "🌘 Waning Crescent";
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
                return "🌘 Waning Crescent";
            }
        }
    }
}
