using Android.App;
using Android.Content;
using Android.Graphics;
using Android.Media;
using Android.OS;
using Android.Views;
using AndroidX.AppCompat.Widget;
using Google.Android.Material.Dialog;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using WoWonder.Activities.DefaultUser;
using WoWonder.Activities.SettingsPreferences;
using WoWonder.Activities.Tab;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Model;
using WoWonder.SQLite;
using WoWonderClient;
using WoWonderClient.Classes.Call;
using WoWonderClient.Classes.Global;
using WoWonderClient.Requests;
using Application = Android.App.Application;
using Exception = Java.Lang.Exception;
using Path = System.IO.Path;

namespace WoWonder.Helpers.Utils
{
    public static class WoWonderTools
    {
        public static string GetNameFinal(UserDataObject dataUser)
        {
            try
            {
                if (dataUser == null)
                    return "";

                if (!string.IsNullOrEmpty(dataUser.Name) || !string.IsNullOrWhiteSpace(dataUser.Name))
                    return Methods.FunString.DecodeString(dataUser.Name);

                if (!string.IsNullOrEmpty(dataUser.Username) || !string.IsNullOrWhiteSpace(dataUser.Username))
                    return Methods.FunString.DecodeString(dataUser.Username);

                return "";
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return "";
            }
        }

        public static string GetAboutFinal(UserDataObject dataUser)
        {
            try
            {
                return dataUser switch
                {
                    null => Application.Context.Resources?.GetString(Resource.String.Lbl_DefaultAbout) + " " + AppSettings.ApplicationName,
                    _ => string.IsNullOrEmpty(dataUser.About) switch
                    {
                        false when !string.IsNullOrWhiteSpace(dataUser.About) => Methods.FunString.DecodeString(dataUser.About),
                        _ => Application.Context.Resources?.GetString(Resource.String.Lbl_DefaultAbout) + " " +
                             AppSettings.ApplicationName
                    }
                };
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return Application.Context.Resources?.GetString(Resource.String.Lbl_DefaultAbout) + " " + AppSettings.ApplicationName;
            }
        }

        public static void OpenProfile(Activity activity, string userId, UserDataObject item = null)
        {
            try
            {
                if (userId != UserDetails.UserId)
                {
                    var intent = new Intent(activity, typeof(UserProfileActivity));
                    if (item != null) intent.PutExtra("UserObject", JsonConvert.SerializeObject(item));
                    intent.PutExtra("UserId", userId);
                    //intent.PutExtra("NamePage", namePage);
                    activity.StartActivity(intent);
                }
                else
                {
                    var intent = new Intent(activity, typeof(MyProfileActivity));
                    activity.StartActivity(intent);
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public static (string, string) GetCurrency(string idCurrency)
        {
            try
            {
                switch (AppSettings.CurrencyStatic)
                {
                    case true:
                        return (AppSettings.CurrencyCodeStatic, AppSettings.CurrencyIconStatic);
                }

                string currency = AppSettings.CurrencyCodeStatic;
                bool success = int.TryParse(idCurrency, out var number);
                if (success)
                {
                    Console.WriteLine("Converted '{0}' to {1}.", idCurrency, number);
                    if (ListUtils.SettingsSiteList?.CurrencyArray.CurrencyList?.Count > 0 && ListUtils.SettingsSiteList?.CurrencyArray.CurrencyList?.Count > number)
                        currency = ListUtils.SettingsSiteList?.CurrencyArray.CurrencyList[number] ?? AppSettings.CurrencyCodeStatic;
                    else if (ListUtils.SettingsSiteList?.CurrencyArray.StringMap?.Count > 0)
                    {
                        currency = ListUtils.SettingsSiteList?.CurrencyArray.StringMap?.FirstOrDefault(a => a.Key == number.ToString()).Value ?? AppSettings.CurrencyCodeStatic;
                    }
                }
                else
                {
                    Console.WriteLine("Attempted conversion of '{0}' failed.", idCurrency ?? "<null>");
                    currency = idCurrency;
                }

                if (ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList != null)
                {
                    string currencyIcon = ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.FirstOrDefault(a => a.Key == currency?.ToUpper()).Value ?? "";

                    //switch (currency?.ToUpper())
                    //{
                    //    case "USD":
                    //        currencyIcon = !string.IsNullOrEmpty(ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Usd)
                    //                ? ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Usd ?? "$" : "$";
                    //        break;
                    //    case "Jpy":
                    //        currencyIcon = !string.IsNullOrEmpty(ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Jpy)
                    //                ? ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Jpy ?? "¥"
                    //                : "¥";
                    //        break;
                    //    case "EUR":
                    //        currencyIcon = !string.IsNullOrEmpty(ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Eur)
                    //                ? ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Eur ?? "€"
                    //                : "€";
                    //        break;
                    //    case "TRY":
                    //        currencyIcon = !string.IsNullOrEmpty(ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Try)
                    //                ? ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Try ?? "₺"
                    //                : "₺";
                    //        break;
                    //    case "GBP":
                    //        currencyIcon =
                    //            !string.IsNullOrEmpty(ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Gbp)
                    //                ? ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Gbp ?? "£"
                    //                : "£";
                    //        break;
                    //    case "RUB":
                    //        currencyIcon =
                    //            !string.IsNullOrEmpty(ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Rub)
                    //                ? ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Rub ?? "₽"
                    //                : "₽";
                    //        break;
                    //    case "PLN":
                    //        currencyIcon =
                    //            !string.IsNullOrEmpty(ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Pln)
                    //                ? ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Pln ?? "zł"
                    //                : "zł";
                    //        break;
                    //    case "ILS":
                    //        currencyIcon =
                    //            !string.IsNullOrEmpty(ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Ils)
                    //                ? ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Ils ?? "₪"
                    //                : "₪";
                    //        break;
                    //    case "BRL":
                    //        currencyIcon =
                    //            !string.IsNullOrEmpty(ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Brl)
                    //                ? ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Brl ?? "R$"
                    //                : "R$";
                    //        break;
                    //    case "INR":
                    //        currencyIcon =
                    //            !string.IsNullOrEmpty(ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Inr)
                    //                ? ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Inr ?? "₹"
                    //                : "₹";
                    //        break;
                    //    default:
                    //        currencyIcon =
                    //            !string.IsNullOrEmpty(ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Usd)
                    //                ? ListUtils.SettingsSiteList?.CurrencySymbolArray.CurrencyList.Usd ?? "$"
                    //                : "$";
                    //        break;
                    //}

                    return (currency, currencyIcon);
                }

                return (AppSettings.CurrencyCodeStatic, AppSettings.CurrencyIconStatic);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return (AppSettings.CurrencyCodeStatic, AppSettings.CurrencyIconStatic);
            }
        }

        public static bool GetStatusOnline(int lastSeen, string isShowOnline)
        {
            try
            {
                string time = Methods.Time.TimeAgo(lastSeen, false);
                bool status = isShowOnline == "on" && time == Methods.Time.LblJustNow;
                return status;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return false;
            }
        }

        public static Dictionary<string, string> GetCountryList(Activity activity)
        {
            try
            {
                var arrayAdapter = new Dictionary<string, string>
                {
                    {"1",  activity.GetString(Resource.String.Lbl_country1)},
                    {"2",  activity.GetString(Resource.String.Lbl_country2)},
                    {"3",  activity.GetString(Resource.String.Lbl_country3)},
                    {"4",  activity.GetString(Resource.String.Lbl_country4)},
                    {"5",  activity.GetString(Resource.String.Lbl_country5)},
                    {"6",  activity.GetString(Resource.String.Lbl_country6)},
                    {"7",  activity.GetString(Resource.String.Lbl_country7)},
                    {"8",  activity.GetString(Resource.String.Lbl_country8)},
                    {"9",  activity.GetString(Resource.String.Lbl_country9)},
                    {"10", activity.GetString(Resource.String.Lbl_country10)},
                    {"11", activity.GetString(Resource.String.Lbl_country11)},
                    {"12", activity.GetString(Resource.String.Lbl_country12)},
                    {"13", activity.GetString(Resource.String.Lbl_country13)},
                    {"14", activity.GetString(Resource.String.Lbl_country14)},
                    {"15", activity.GetString(Resource.String.Lbl_country15)},
                    {"16", activity.GetString(Resource.String.Lbl_country16)},
                    {"17", activity.GetString(Resource.String.Lbl_country17)},
                    {"18", activity.GetString(Resource.String.Lbl_country18)},
                    {"19", activity.GetString(Resource.String.Lbl_country19)},
                    {"20", activity.GetString(Resource.String.Lbl_country20)},
                    {"21", activity.GetString(Resource.String.Lbl_country21)},
                    {"22", activity.GetString(Resource.String.Lbl_country22)},
                    {"23", activity.GetString(Resource.String.Lbl_country23)},
                    {"24", activity.GetString(Resource.String.Lbl_country24)},
                    {"25", activity.GetString(Resource.String.Lbl_country25)},
                    {"26", activity.GetString(Resource.String.Lbl_country26)},
                    {"27", activity.GetString(Resource.String.Lbl_country27)},
                    {"28", activity.GetString(Resource.String.Lbl_country28)},
                    {"29", activity.GetString(Resource.String.Lbl_country29)},
                    {"30", activity.GetString(Resource.String.Lbl_country30)},
                    {"31", activity.GetString(Resource.String.Lbl_country31)},
                    {"32", activity.GetString(Resource.String.Lbl_country32)},
                    {"34", activity.GetString(Resource.String.Lbl_country34)},
                    {"35", activity.GetString(Resource.String.Lbl_country35)},
                    {"36", activity.GetString(Resource.String.Lbl_country36)},
                    {"37", activity.GetString(Resource.String.Lbl_country37)},
                    {"38", activity.GetString(Resource.String.Lbl_country38)},
                    {"39", activity.GetString(Resource.String.Lbl_country39)},
                    {"40", activity.GetString(Resource.String.Lbl_country40)},
                    {"41", activity.GetString(Resource.String.Lbl_country41)},
                    {"42", activity.GetString(Resource.String.Lbl_country42)},
                    {"43", activity.GetString(Resource.String.Lbl_country43)},
                    {"44", activity.GetString(Resource.String.Lbl_country44)},
                    {"45", activity.GetString(Resource.String.Lbl_country45)},
                    {"46", activity.GetString(Resource.String.Lbl_country46)},
                    {"47", activity.GetString(Resource.String.Lbl_country47)},
                    {"48", activity.GetString(Resource.String.Lbl_country48)},
                    {"49", activity.GetString(Resource.String.Lbl_country49)},
                    {"50", activity.GetString(Resource.String.Lbl_country50)},
                    {"51", activity.GetString(Resource.String.Lbl_country51)},
                    {"52", activity.GetString(Resource.String.Lbl_country52)},
                    {"53", activity.GetString(Resource.String.Lbl_country53)},
                    {"54", activity.GetString(Resource.String.Lbl_country54)},
                    {"55", activity.GetString(Resource.String.Lbl_country55)},
                    {"56", activity.GetString(Resource.String.Lbl_country56)},
                    {"57", activity.GetString(Resource.String.Lbl_country57)},
                    {"58", activity.GetString(Resource.String.Lbl_country58)},
                    {"59", activity.GetString(Resource.String.Lbl_country59)},
                    {"60", activity.GetString(Resource.String.Lbl_country60)},
                    {"61", activity.GetString(Resource.String.Lbl_country61)},
                    {"62", activity.GetString(Resource.String.Lbl_country62)},
                    {"63", activity.GetString(Resource.String.Lbl_country63)},
                    {"64", activity.GetString(Resource.String.Lbl_country64)},
                    {"65", activity.GetString(Resource.String.Lbl_country65)},
                    {"66", activity.GetString(Resource.String.Lbl_country66)},
                    {"67", activity.GetString(Resource.String.Lbl_country67)},
                    {"68", activity.GetString(Resource.String.Lbl_country68)},
                    {"69", activity.GetString(Resource.String.Lbl_country69)},
                    {"70", activity.GetString(Resource.String.Lbl_country70)},
                    {"71", activity.GetString(Resource.String.Lbl_country71)},
                    {"72", activity.GetString(Resource.String.Lbl_country72)},
                    {"73", activity.GetString(Resource.String.Lbl_country73)},
                    {"74", activity.GetString(Resource.String.Lbl_country74)},
                    {"75", activity.GetString(Resource.String.Lbl_country75)},
                    {"76", activity.GetString(Resource.String.Lbl_country76)},
                    {"77", activity.GetString(Resource.String.Lbl_country77)},
                    {"78", activity.GetString(Resource.String.Lbl_country78)},
                    {"79", activity.GetString(Resource.String.Lbl_country79)},
                    {"80", activity.GetString(Resource.String.Lbl_country80)},
                    {"81", activity.GetString(Resource.String.Lbl_country81)},
                    {"82", activity.GetString(Resource.String.Lbl_country82)},
                    {"83", activity.GetString(Resource.String.Lbl_country83)},
                    {"84", activity.GetString(Resource.String.Lbl_country84)},
                    {"85", activity.GetString(Resource.String.Lbl_country85)},
                    {"86", activity.GetString(Resource.String.Lbl_country86)},
                    {"87", activity.GetString(Resource.String.Lbl_country87)},
                    {"88", activity.GetString(Resource.String.Lbl_country88)},
                    {"89", activity.GetString(Resource.String.Lbl_country89)},
                    {"90", activity.GetString(Resource.String.Lbl_country90)},
                    {"91", activity.GetString(Resource.String.Lbl_country91)},
                    {"92", activity.GetString(Resource.String.Lbl_country92)},
                    {"93", activity.GetString(Resource.String.Lbl_country93)},
                    {"94", activity.GetString(Resource.String.Lbl_country94)},
                    {"95", activity.GetString(Resource.String.Lbl_country95)},
                    {"96", activity.GetString(Resource.String.Lbl_country96)},
                    {"97", activity.GetString(Resource.String.Lbl_country97)},
                    {"98", activity.GetString(Resource.String.Lbl_country98)},
                    {"99", activity.GetString(Resource.String.Lbl_country99)},
                    {"100",activity.GetString(Resource.String.Lbl_country100)},
                    {"101",activity.GetString(Resource.String.Lbl_country101)},
                    {"102",activity.GetString(Resource.String.Lbl_country102)},
                    {"103",activity.GetString(Resource.String.Lbl_country103)},
                    {"104",activity.GetString(Resource.String.Lbl_country104)},
                    {"105",activity.GetString(Resource.String.Lbl_country105)},
                    {"106",activity.GetString(Resource.String.Lbl_country106)},
                    {"107",activity.GetString(Resource.String.Lbl_country107)},
                    {"108",activity.GetString(Resource.String.Lbl_country108)},
                    {"109",activity.GetString(Resource.String.Lbl_country109)},
                    {"110",activity.GetString(Resource.String.Lbl_country110)},
                    {"111",activity.GetString(Resource.String.Lbl_country111)},
                    {"112",activity.GetString(Resource.String.Lbl_country112)},
                    {"113",activity.GetString(Resource.String.Lbl_country113)},
                    {"114",activity.GetString(Resource.String.Lbl_country114)},
                    {"115",activity.GetString(Resource.String.Lbl_country115)},
                    {"116",activity.GetString(Resource.String.Lbl_country116)},
                    {"117",activity.GetString(Resource.String.Lbl_country117)},
                    {"118",activity.GetString(Resource.String.Lbl_country118)},
                    {"119",activity.GetString(Resource.String.Lbl_country119)},
                    {"120",activity.GetString(Resource.String.Lbl_country120)},
                    {"121",activity.GetString(Resource.String.Lbl_country121)},
                    {"122",activity.GetString(Resource.String.Lbl_country122)},
                    {"123",activity.GetString(Resource.String.Lbl_country123)},
                    {"124",activity.GetString(Resource.String.Lbl_country124)},
                    {"125",activity.GetString(Resource.String.Lbl_country125)},
                    {"126",activity.GetString(Resource.String.Lbl_country126)},
                    {"127",activity.GetString(Resource.String.Lbl_country127)},
                    {"128",activity.GetString(Resource.String.Lbl_country128)},
                    {"129",activity.GetString(Resource.String.Lbl_country129)},
                    {"130",activity.GetString(Resource.String.Lbl_country130)},
                    {"131",activity.GetString(Resource.String.Lbl_country131)},
                    {"132",activity.GetString(Resource.String.Lbl_country132)},
                    {"133",activity.GetString(Resource.String.Lbl_country133)},
                    {"134",activity.GetString(Resource.String.Lbl_country134)},
                    {"135",activity.GetString(Resource.String.Lbl_country135)},
                    {"136",activity.GetString(Resource.String.Lbl_country136)},
                    {"137",activity.GetString(Resource.String.Lbl_country137)},
                    {"138",activity.GetString(Resource.String.Lbl_country138)},
                    {"139",activity.GetString(Resource.String.Lbl_country139)},
                    {"140",activity.GetString(Resource.String.Lbl_country140)},
                    {"141",activity.GetString(Resource.String.Lbl_country141)},
                    {"142",activity.GetString(Resource.String.Lbl_country142)},
                    {"143",activity.GetString(Resource.String.Lbl_country143)},
                    {"144",activity.GetString(Resource.String.Lbl_country144)},
                    {"145",activity.GetString(Resource.String.Lbl_country145)},
                    {"146",activity.GetString(Resource.String.Lbl_country146)},
                    {"147",activity.GetString(Resource.String.Lbl_country147)},
                    {"148",activity.GetString(Resource.String.Lbl_country148)},
                    {"149",activity.GetString(Resource.String.Lbl_country149)},
                    {"150",activity.GetString(Resource.String.Lbl_country150)},
                    {"151",activity.GetString(Resource.String.Lbl_country151)},
                    {"152",activity.GetString(Resource.String.Lbl_country152)},
                    {"153",activity.GetString(Resource.String.Lbl_country153)},
                    {"154",activity.GetString(Resource.String.Lbl_country154)},
                    {"155",activity.GetString(Resource.String.Lbl_country155)},
                    {"156",activity.GetString(Resource.String.Lbl_country156)},
                    {"157",activity.GetString(Resource.String.Lbl_country157)},
                    {"158",activity.GetString(Resource.String.Lbl_country158)},
                    {"159",activity.GetString(Resource.String.Lbl_country159)},
                    {"160",activity.GetString(Resource.String.Lbl_country160)},
                    {"161",activity.GetString(Resource.String.Lbl_country161)},
                    {"162",activity.GetString(Resource.String.Lbl_country162)},
                    {"163",activity.GetString(Resource.String.Lbl_country163)},
                    {"164",activity.GetString(Resource.String.Lbl_country164)},
                    {"165",activity.GetString(Resource.String.Lbl_country165)},
                    {"166",activity.GetString(Resource.String.Lbl_country166)},
                    {"167",activity.GetString(Resource.String.Lbl_country167)},
                    {"168",activity.GetString(Resource.String.Lbl_country168)},
                    {"169",activity.GetString(Resource.String.Lbl_country169)},
                    {"170",activity.GetString(Resource.String.Lbl_country170)},
                    {"171",activity.GetString(Resource.String.Lbl_country171)},
                    {"172",activity.GetString(Resource.String.Lbl_country172)},
                    {"173",activity.GetString(Resource.String.Lbl_country173)},
                    {"174",activity.GetString(Resource.String.Lbl_country174)},
                    {"175",activity.GetString(Resource.String.Lbl_country175)},
                    {"176",activity.GetString(Resource.String.Lbl_country176)},
                    {"177",activity.GetString(Resource.String.Lbl_country177)},
                    {"178",activity.GetString(Resource.String.Lbl_country178)},
                    {"179",activity.GetString(Resource.String.Lbl_country179)},
                    {"180",activity.GetString(Resource.String.Lbl_country180)},
                    {"181",activity.GetString(Resource.String.Lbl_country181)},
                    {"182",activity.GetString(Resource.String.Lbl_country182)},
                    {"183",activity.GetString(Resource.String.Lbl_country183)},
                    {"184",activity.GetString(Resource.String.Lbl_country184)},
                    {"185",activity.GetString(Resource.String.Lbl_country185)},
                    {"186",activity.GetString(Resource.String.Lbl_country186)},
                    {"187",activity.GetString(Resource.String.Lbl_country187)},
                    {"188",activity.GetString(Resource.String.Lbl_country188)},
                    {"189",activity.GetString(Resource.String.Lbl_country189)},
                    {"190",activity.GetString(Resource.String.Lbl_country190)},
                    {"191",activity.GetString(Resource.String.Lbl_country191)},
                    {"192",activity.GetString(Resource.String.Lbl_country192)},
                    {"193",activity.GetString(Resource.String.Lbl_country193)},
                    {"194",activity.GetString(Resource.String.Lbl_country194)},
                    {"195",activity.GetString(Resource.String.Lbl_country195)},
                    {"196",activity.GetString(Resource.String.Lbl_country196)},
                    {"197",activity.GetString(Resource.String.Lbl_country197)},
                    {"198",activity.GetString(Resource.String.Lbl_country198)},
                    {"199",activity.GetString(Resource.String.Lbl_country199)},
                    {"200",activity.GetString(Resource.String.Lbl_country200)},
                    {"201",activity.GetString(Resource.String.Lbl_country201)},
                    {"202",activity.GetString(Resource.String.Lbl_country202)},
                    {"203",activity.GetString(Resource.String.Lbl_country203)},
                    {"204",activity.GetString(Resource.String.Lbl_country204)},
                    {"205",activity.GetString(Resource.String.Lbl_country205)},
                    {"206",activity.GetString(Resource.String.Lbl_country206)},
                    {"207",activity.GetString(Resource.String.Lbl_country207)},
                    {"208",activity.GetString(Resource.String.Lbl_country208)},
                    {"209",activity.GetString(Resource.String.Lbl_country209)},
                    {"210",activity.GetString(Resource.String.Lbl_country210)},
                    {"211",activity.GetString(Resource.String.Lbl_country211)},
                    {"212",activity.GetString(Resource.String.Lbl_country212)},
                    {"213",activity.GetString(Resource.String.Lbl_country213)},
                    {"214",activity.GetString(Resource.String.Lbl_country214)},
                    {"215",activity.GetString(Resource.String.Lbl_country215)},
                    {"216",activity.GetString(Resource.String.Lbl_country216)},
                    {"217",activity.GetString(Resource.String.Lbl_country217)},
                    {"218",activity.GetString(Resource.String.Lbl_country218)},
                    {"219",activity.GetString(Resource.String.Lbl_country219)},
                    {"220",activity.GetString(Resource.String.Lbl_country220)},
                    {"221",activity.GetString(Resource.String.Lbl_country221)},
                    {"222",activity.GetString(Resource.String.Lbl_country222)},
                    {"223",activity.GetString(Resource.String.Lbl_country223)},
                    {"224",activity.GetString(Resource.String.Lbl_country224)},
                    {"225",activity.GetString(Resource.String.Lbl_country225)},
                    {"226",activity.GetString(Resource.String.Lbl_country226)},
                    {"227",activity.GetString(Resource.String.Lbl_country227)},
                    {"228",activity.GetString(Resource.String.Lbl_country228)},
                    {"229",activity.GetString(Resource.String.Lbl_country229)},
                    {"230",activity.GetString(Resource.String.Lbl_country230)},
                    {"231",activity.GetString(Resource.String.Lbl_country231)},
                    {"232",activity.GetString(Resource.String.Lbl_country232)},
                    {"233",activity.GetString(Resource.String.Lbl_country233)},
                    {"238",activity.GetString(Resource.String.Lbl_country238)},
                    {"239",activity.GetString(Resource.String.Lbl_country239)},
                    {"240",activity.GetString(Resource.String.Lbl_country240)},
                    {"241",activity.GetString(Resource.String.Lbl_country241)},
                    {"242",activity.GetString(Resource.String.Lbl_country242)},
                };

                return arrayAdapter;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return new Dictionary<string, string>();
            }
        }

        public static bool CheckAllowedFileUpload()
        {
            try
            {
                var dataSettings = ListUtils.SettingsSiteList;
                if (dataSettings?.WhoUpload == "pro") //just pro user can chat 
                {
                    var dataUser = ListUtils.MyProfileList?.FirstOrDefault()?.IsPro;
                    if (dataUser == "0") // Not Pro remove call
                    {
                        return false;
                    }
                }
                else  //"all"
                {
                    return true;
                }

                return true;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return true;
            }
        }

        public static bool CheckAllowedFileSharingInServer(string type)
        {
            try
            {
                switch (type)
                {
                    case "File" when !string.IsNullOrEmpty(ListUtils.SettingsSiteList?.FileSharing) && ListUtils.SettingsSiteList?.FileSharing == "1":
                    // Allowed
                    case "Video" when !string.IsNullOrEmpty(ListUtils.SettingsSiteList?.VideoUpload) && ListUtils.SettingsSiteList?.VideoUpload == "1":
                    // Allowed
                    case "Audio" when !string.IsNullOrEmpty(ListUtils.SettingsSiteList?.AudioUpload) && ListUtils.SettingsSiteList?.AudioUpload == "1":
                    // Allowed
                    case "Image":
                        // Allowed
                        return true;
                    default:
                        return false;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return false;
            }
        }

        public static async Task<(bool, string)> CheckMimeTypesWithServer(string path)
        {
            try
            {
                var allowedExtenstionStatic = "jpg,png,jpeg,gif,mp4,m4v,webm,flv,mov,mpeg,mp3,wav";
                if (!string.IsNullOrEmpty(path))
                {
                    var fileName = path.Split('/').Last();
                    var fileNameWithExtension = fileName.Split('.').Last();

                    if (!string.IsNullOrEmpty(ListUtils.SettingsSiteList?.MimeTypes))
                    {
                        var allowedExtenstion = ListUtils.SettingsSiteList?.AllowedExtenstion; //jpg,png,jpeg,gif,mkv,docx,zip,rar,pdf,doc,mp3,mp4,flv,wav,txt,mov,avi,webm,wav,mpeg
                        var mimeTypes = ListUtils.SettingsSiteList?.MimeTypes; //video/mp4,video/mov,video/mpeg,video/flv,video/avi,video/webm,audio/wav,audio/mpeg,video/quicktime,audio/mp3,image/png,image/jpeg,image/gif,application/pdf,application/msword,application/zip,application/x-rar-compressed,text/pdf,application/x-pointplus,text/css

                        var getMimeType = MimeTypeMap.GetMimeType(fileNameWithExtension);

                        if (allowedExtenstion.Contains(fileNameWithExtension) && mimeTypes.Contains(getMimeType))
                        {
                            var type = Methods.AttachmentFiles.Check_FileExtension(path);

                            var check = CheckAllowedFileSharingInServer(type);
                            if (check)
                            {
                                if (!string.IsNullOrEmpty(ListUtils.SettingsSiteList?.VisionApiKey) && ListUtils.SettingsSiteList?.AdultImages == "1")
                                {
                                    byte[] dataDate = await File.ReadAllBytesAsync(path);

                                    var data = await GoogleVision.CheckVisionImage(dataDate);
                                    if (!string.IsNullOrEmpty(data?.Error?.Message) || data?.Responses[0]?.SafeSearchAnnotation?.Adult is "LIKELY" or "VERY_LIKELY")
                                    {
                                        //"This photo contains sensitive content which some people may find offensive or disturbing"
                                        return (false, "AdultImages");
                                    }
                                }

                                if (ListUtils.SettingsSiteList?.FfmpegSystem == "on" & type == "Video")
                                {
                                    var allowedffmpegExtenstion = ListUtils.SettingsSiteList?.AllowedffmpegExtenstion; //mov,mp4,m4a,3gp,3g2,mj2,asf,avi,flv,webm,m4v,mpeg,mpeg,mpeg,ogv,mkv,webm,mov
                                    if (allowedffmpegExtenstion.Contains(fileNameWithExtension))
                                    {
                                        return (true, "");
                                    }
                                }
                                else
                                {
                                    return (true, "");
                                }
                            }
                        }
                    }

                    //just this Allowed : >> jpg,png,jpeg,gif,mp4,m4v,webm,flv,mov,mpeg,mp3,wav
                    if (allowedExtenstionStatic.Contains(fileNameWithExtension))
                        return (true, "");
                }

                return (false, "");
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return (false, "");
            }
        }

        // Functions Save Images
        private static async void SaveFile(string id, string folder, string fileName, string url, string type, bool allowDownload)
        {
            try
            {
                if (!url.Contains("http")) return;

                if (CheckAllowedDownloadMedia(type) || allowDownload)
                {
                    string folderDestination = folder + id + "/";

                    string filePath = Path.Combine(folderDestination);
                    string mediaFile = filePath + "/" + fileName;

                    if (File.Exists(mediaFile)) return;

                    HttpClient client;
                    if (AppSettings.TurnSecurityProtocolType3072On)
                    {
                        HttpClientHandler clientHandler = new HttpClientHandler();
                        clientHandler.ServerCertificateCustomValidationCallback = (sender, cert, chain, sslPolicyErrors) => true;
                        //clientHandler.SslProtocols = SslProtocols.Tls | SslProtocols.Ssl2 | SslProtocols.Ssl3 | SslProtocols.Tls11 | SslProtocols.Tls12 | SslProtocols.Tls13 | SslProtocols.Default;

                        // Pass the handler to httpClient(from you are calling api)
                        client = new HttpClient(clientHandler);
                    }
                    else
                    {
                        client = new HttpClient();
                    }

                    var s = await client.GetStreamAsync(new Uri(url));
                    if (s.CanRead)
                    {
                        if (File.Exists(mediaFile)) return;

                        await using FileStream fs = new FileStream(mediaFile, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
                        await s.CopyToAsync(fs);
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        // Functions Save Images
        public static async Task<string> SaveFileAsync(string folder, string fileName, string url, string type)
        {
            try
            {
                if (!url.Contains("http")) return "";

                string folderDestination = folder + "/";

                string filePath = Path.Combine(folderDestination);
                string mediaFile = filePath + "/" + fileName;

                if (File.Exists(mediaFile)) return mediaFile;

                HttpClient client;
                if (AppSettings.TurnSecurityProtocolType3072On)
                {
                    HttpClientHandler clientHandler = new HttpClientHandler();
                    clientHandler.ServerCertificateCustomValidationCallback = (sender, cert, chain, sslPolicyErrors) => true;
                    //clientHandler.SslProtocols = SslProtocols.Tls | SslProtocols.Ssl2 | SslProtocols.Ssl3 | SslProtocols.Tls11 | SslProtocols.Tls12 | SslProtocols.Tls13 | SslProtocols.Default;

                    // Pass the handler to httpClient(from you are calling api)
                    client = new HttpClient(clientHandler);
                }
                else
                {
                    client = new HttpClient();
                }

                var s = await client.GetStreamAsync(new Uri(url));
                if (s.CanRead)
                {
                    if (File.Exists(mediaFile)) return mediaFile;

                    await using FileStream fs = new FileStream(mediaFile, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
                    await s.CopyToAsync(fs);

                    return mediaFile;
                }
                return "";
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return "";
            }
        }

        // Functions file from folder
        public static string GetFile(string id, string folder, string filename, string url, string type, bool allowDownload = false)
        {
            try
            {
                string folderDestination = folder + id + "/";
                string filePath = Path.Combine(folderDestination);
                string mediaFile = filePath + "/" + filename;

                if (!Directory.Exists(folderDestination))
                {
                    if (Directory.Exists(Methods.Path.FolderDiskStory))
                        Directory.Delete(Methods.Path.FolderDiskStory, true);

                    Directory.CreateDirectory(folderDestination);
                }

                string imageFile = Methods.MultiMedia.GetMediaFrom_Gallery(folderDestination, filename);
                if (imageFile == "File Dont Exists")
                {
                    //This code runs on a new thread, control is returned to the caller on the UI thread.
                    if (!url.Contains("http")) return url;
                    Task.Factory.StartNew(() => { SaveFile(id, folder, filename, url, type, allowDownload); });
                    return url;
                }

                return imageFile;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return url;
            }
        }

        public static string GetDuration(string mediaFile)
        {
            if (string.IsNullOrEmpty(mediaFile))
                return "0";

            try
            {
                var type = Methods.AttachmentFiles.Check_FileExtension(mediaFile);
                if (type == "Audio" || type == "Video")
                {
                    string duration;
                    MediaMetadataRetriever retriever;
                    if (mediaFile.Contains("http"))
                    {
                        retriever = new MediaMetadataRetriever();
                        switch ((int)Build.VERSION.SdkInt)
                        {
                            case >= 14:
                                retriever.SetDataSource(mediaFile, new Dictionary<string, string>());
                                break;
                            default:
                                retriever.SetDataSource(mediaFile);
                                break;
                        }

                        duration = retriever.ExtractMetadata(MetadataKey.Duration); //time In Millisec 
                        retriever.Release();
                    }
                    else
                    {
                        var file = Android.Net.Uri.FromFile(new Java.IO.File(mediaFile));
                        retriever = new MediaMetadataRetriever();
                        //if ((int)Build.VERSION.SdkInt >= 14)
                        //    retriever.SetDataSource(file.Path, new Dictionary<string, string>());
                        //else
                        retriever.SetDataSource(file?.Path);

                        duration = retriever.ExtractMetadata(MetadataKey.Duration); //time In Millisec 
                        retriever.Release();
                    }
                    return duration;
                }

                return "0";
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return "0";
            }
        }

        public static async Task GetSharedFiles(string id)
        {
            try
            {
                var imagePath = Methods.Path.FolderDcimImage + id;
                var stickerPath = Methods.Path.FolderDiskSticker + id;
                var gifPath = Methods.Path.FolderDiskGif + id;
                var soundsPath = Methods.Path.FolderDcimSound + id;
                var videoPath = Methods.Path.FolderDcimVideo + id;
                var otherPath = Methods.Path.FolderDcimFile + id;

                //Check for folder if exists
                if (!Directory.Exists(imagePath))
                    Directory.CreateDirectory(imagePath);

                if (!Directory.Exists(stickerPath))
                    Directory.CreateDirectory(stickerPath);

                if (!Directory.Exists(gifPath))
                    Directory.CreateDirectory(gifPath);

                if (!Directory.Exists(soundsPath))
                    Directory.CreateDirectory(soundsPath);

                if (!Directory.Exists(videoPath))
                    Directory.CreateDirectory(videoPath);

                if (!Directory.Exists(otherPath))
                    Directory.CreateDirectory(otherPath);

                var imageFiles = new DirectoryInfo(imagePath).GetFiles().OrderByDescending(f => f.LastWriteTime).ToList();
                var stickerFiles = new DirectoryInfo(stickerPath).GetFiles().OrderByDescending(f => f.LastWriteTime).ToList();
                var gifFiles = new DirectoryInfo(gifPath).GetFiles().OrderByDescending(f => f.LastWriteTime).ToList();
                var soundsFiles = new DirectoryInfo(soundsPath).GetFiles().OrderByDescending(f => f.LastWriteTime).ToList();
                var videoFiles = new DirectoryInfo(videoPath).GetFiles().OrderByDescending(f => f.LastWriteTime).ToList();
                var otherFiles = new DirectoryInfo(otherPath).GetFiles().OrderByDescending(f => f.LastWriteTime).ToList();

                if (imageFiles.Count > 0)
                {
                    foreach (var dir in from file in imageFiles
                                        let check = ListUtils.ListSharedFiles.FirstOrDefault(a => a.FileName.Contains(file.Name))
                                        where check == null
                                        select new Classes.SharedFile
                                        {
                                            FileType = "Image",
                                            FileName = file.Name,
                                            FileDate = file.LastWriteTime.Millisecond.ToString(),
                                            FilePath = file.FullName,
                                            ImageExtra = file.FullName,
                                            FileExtension = file.Extension,
                                        })
                    {
                        ListUtils.ListSharedFiles.Add(dir);
                    }
                }

                if (stickerFiles.Count > 0)
                {
                    foreach (var dir in from file in stickerFiles
                                        let check = ListUtils.ListSharedFiles.FirstOrDefault(a => a.FileName.Contains(file.Name))
                                        where check == null
                                        select new Classes.SharedFile
                                        {
                                            FileType = "Sticker",
                                            FileName = file.Name,
                                            FileDate = file.LastWriteTime.Millisecond.ToString(),
                                            FilePath = file.FullName,
                                            ImageExtra = file.FullName,
                                            FileExtension = file.Extension,
                                        })
                    {
                        ListUtils.ListSharedFiles.Add(dir);
                    }
                }

                if (gifFiles.Count > 0)
                {
                    foreach (var dir in from file in gifFiles
                                        let check = ListUtils.ListSharedFiles.FirstOrDefault(a => a.FileName.Contains(file.Name))
                                        where check == null
                                        select new Classes.SharedFile
                                        {
                                            FileType = "Gif",
                                            FileName = file.Name,
                                            FileDate = file.LastWriteTime.Millisecond.ToString(),
                                            FilePath = file.FullName,
                                            ImageExtra = file.FullName,
                                            FileExtension = file.Extension,
                                        })
                    {
                        ListUtils.ListSharedFiles.Add(dir);
                    }
                }

                if (soundsFiles.Count > 0)
                {
                    foreach (var dir in from file in soundsFiles
                                        let check = ListUtils.ListSharedFiles.FirstOrDefault(a => a.FileName.Contains(file.Name))
                                        where check == null
                                        select new Classes.SharedFile
                                        {
                                            FileType = "Sounds",
                                            FileName = file.Name,
                                            FileDate = file.LastWriteTime.Millisecond.ToString(),
                                            FilePath = file.FullName,
                                            ImageExtra = "Audio_File",
                                            FileExtension = file.Extension,
                                        })
                    {
                        ListUtils.ListSharedFiles.Add(dir);
                    }
                }

                if (videoFiles.Count > 0)
                {
                    foreach (var dir in from file in videoFiles
                                        let check = ListUtils.ListSharedFiles.FirstOrDefault(a => a.FileName.Contains(file.Name))
                                        where check == null
                                        select new Classes.SharedFile
                                        {
                                            FileType = "Video",
                                            FileName = file.Name,
                                            FileDate = file.LastWriteTime.Millisecond.ToString(),
                                            FilePath = file.FullName,
                                            ImageExtra = file.FullName,
                                            FileExtension = file.Extension,
                                        })
                    {
                        ListUtils.ListSharedFiles.Add(dir);
                    }
                }

                if (otherFiles.Count > 0)
                {
                    foreach (var dir in from file in otherFiles
                                        let check = ListUtils.ListSharedFiles.FirstOrDefault(a => a.FileName.Contains(file.Name))
                                        where check == null
                                        select new Classes.SharedFile
                                        {
                                            FileType = "File",
                                            FileName = file.Name,
                                            FileDate = file.LastWriteTime.Millisecond.ToString(),
                                            FilePath = file.FullName,
                                            ImageExtra = "Image_File",
                                            FileExtension = file.Extension,
                                        })
                    {
                        ListUtils.ListSharedFiles.Add(dir);
                    }
                }

                if (ListUtils.ListSharedFiles.Count > 0)
                {
                    //Last 50 File
                    List<Classes.SharedFile> orderByDateList = ListUtils.ListSharedFiles.OrderBy(T => T.FileDate).Take(50).ToList();
                    ListUtils.LastSharedFiles = new ObservableCollection<Classes.SharedFile>(orderByDateList);
                }

                await Task.Delay(0);
                Console.WriteLine(ListUtils.ListSharedFiles);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public static void SetAddFriend(Activity activity, UserDataObject item, AppCompatButton btnAddUser)
        {
            try
            {
                item.IsFollowing = item.IsFollowing switch
                {
                    null => "0",
                    _ => item.IsFollowing
                };

                var dbDatabase = new SqLiteDatabase();
                string isFollowing;
                switch (item.IsFollowing)
                {
                    case "0": // Add Or request friends
                    case "no":
                    case "No":
                        {
                            if (item.ConfirmFollowers == "1" || AppSettings.ConnectivitySystem == 0)
                            {
                                item.IsFollowing = isFollowing = "2";
                                btnAddUser.Tag = "request";

                                dbDatabase.Insert_Or_Replace_OR_Delete_UsersContact(item, "Update");
                            }
                            else
                            {
                                item.IsFollowing = isFollowing = "1";
                                btnAddUser.Tag = "friends";

                                dbDatabase.Insert_Or_Replace_OR_Delete_UsersContact(item, "Insert");
                            }

                            SetAddFriendCondition(item, isFollowing, btnAddUser);

                            PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => RequestsAsync.Global.FollowUserAsync(item.UserId) });

                        }
                        break;
                    case "1": // Remove friends
                    case "yes":
                    case "Yes":
                        {
                            var dialog = new MaterialAlertDialogBuilder(activity);
                            dialog.SetMessage(activity.GetText(Resource.String.Lbl_confirmationUnFriend));
                            dialog.SetPositiveButton(activity.GetText(Resource.String.Lbl_Confirm), (materialDialog, action) =>
                            {
                                try
                                {
                                    item.IsFollowing = isFollowing = "0";
                                    btnAddUser.Tag = "Add";

                                    dbDatabase.Insert_Or_Replace_OR_Delete_UsersContact(item, "Delete");

                                    SetAddFriendCondition(item, isFollowing, btnAddUser);

                                    PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => RequestsAsync.Global.FollowUserAsync(item.UserId) });
                                }
                                catch (Exception e)
                                {
                                    Methods.DisplayReportResultTrack(e);
                                }
                            });
                            dialog.SetNegativeButton(activity.GetText(Resource.String.Lbl_Close), new MaterialDialogUtils());

                            dialog.Show();
                        }
                        break;
                    case "2": // Remove request friends 
                        {
                            var dialog = new MaterialAlertDialogBuilder(activity);
                            dialog.SetMessage(activity.GetText(Resource.String.Lbl_confirmationUnFriend));
                            dialog.SetPositiveButton(activity.GetText(Resource.String.Lbl_Confirm), (materialDialog, action) =>
                            {
                                try
                                {
                                    item.IsFollowing = isFollowing = "0";
                                    btnAddUser.Tag = "Add";

                                    dbDatabase = new SqLiteDatabase();
                                    dbDatabase.Insert_Or_Replace_OR_Delete_UsersContact(item, "Delete");

                                    SetAddFriendCondition(item, isFollowing, btnAddUser);

                                    PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => RequestsAsync.Global.FollowUserAsync(item.UserId) });
                                }
                                catch (Exception e)
                                {
                                    Methods.DisplayReportResultTrack(e);
                                }
                            });
                            dialog.SetNegativeButton(activity.GetText(Resource.String.Lbl_Close), new MaterialDialogUtils());

                            dialog.Show();
                        }

                        break;
                }

            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public static void SetAddFriendCondition(UserDataObject userData, string isFollowing, AppCompatButton btnAddUser)
        {
            try
            {
                if (userData.CanFollow == "0" && isFollowing == "0" && userData.UserId != UserDetails.UserId)
                {
                    btnAddUser.Visibility = ViewStates.Gone;
                }

                if (userData.FollowPrivacy == "0") // Everyone
                {
                    btnAddUser.Visibility = ViewStates.Visible;
                }
                else if (userData.FollowPrivacy == "1") // People i Follow
                {
                    if (userData.IsFollowingMe == "0")
                    {
                        btnAddUser.Visibility = isFollowing == "0" ? ViewStates.Gone : ViewStates.Visible;
                    }
                    else if (userData.IsFollowingMe == "1")
                    {
                        btnAddUser.Visibility = ViewStates.Visible;
                    }
                }
                else
                    btnAddUser.Visibility = ViewStates.Visible;

                switch (isFollowing)
                {
                    //>> Not Friend
                    case "0":
                        btnAddUser.SetTextColor(Color.ParseColor(AppSettings.MainColor));
                        btnAddUser.Text = Application.Context.GetText(AppSettings.ConnectivitySystem == 1 ? Resource.String.Lbl_Follow : Resource.String.Lbl_AddFriends);
                        btnAddUser.SetBackgroundResource(Resource.Drawable.round_button_outline);
                        btnAddUser.Tag = "Add";
                        break;
                    //>> Friend
                    case "1":
                        btnAddUser.SetTextColor(Color.White);
                        btnAddUser.Text = Application.Context.GetText(AppSettings.ConnectivitySystem == 1 ? Resource.String.Lbl_Following : Resource.String.Lbl_Friends);
                        btnAddUser.SetBackgroundResource(Resource.Drawable.round_button_pressed);
                        btnAddUser.Tag = "friends";
                        break;
                    //>> Request
                    case "2":
                        btnAddUser.SetTextColor(Color.ParseColor("#444444"));
                        btnAddUser.Text = Application.Context.GetText(Resource.String.Lbl_Request);
                        btnAddUser.SetBackgroundResource(Resource.Drawable.round_button_outline);
                        btnAddUser.Tag = "request";
                        break;
                    default:
                        btnAddUser.SetTextColor(Color.ParseColor(AppSettings.MainColor));
                        btnAddUser.Text = Application.Context.GetText(AppSettings.ConnectivitySystem == 1 ? Resource.String.Lbl_Follow : Resource.String.Lbl_AddFriends);
                        btnAddUser.SetBackgroundResource(Resource.Drawable.round_button_outline);
                        btnAddUser.Tag = "Add";
                        break;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public static int GetProgressSeekBar(int currentDuration, int totalDuration)
        {
            try
            {
                // calculating percentage
                double progress = (double)currentDuration / totalDuration * 10000;
                return progress switch
                {
                    >= 0 =>
                        // return percentage
                        Convert.ToInt32(progress),
                    _ => 0
                };
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return 0;
            }
        }

        public static bool CheckAllowedCall(TypeCall type)
        {
            try
            {
                var dataSettings = ListUtils.SettingsSiteList;

                if (AppSettings.EnableCall == EnableCall.AudioAndVideo)
                {
                    if (dataSettings?.WhoCall == "pro") //just pro user can chat 
                    {
                        var dataUser = ListUtils.MyProfileList?.FirstOrDefault()?.IsPro;
                        return dataUser != "0"; // Not Pro remove call
                    }
                    else //all users can chat
                    {
                        if (type == TypeCall.Video)
                        {
                            return dataSettings?.VideoChat != "0";
                        }

                        if (type == TypeCall.Audio)
                        {
                            return dataSettings?.AudioChat != "0";
                        }
                    }
                }
                else if (AppSettings.EnableCall == EnableCall.OnlyAudio && type == TypeCall.Audio)
                {
                    if (dataSettings?.WhoCall == "pro") //just pro user can chat 
                    {
                        var dataUser = ListUtils.MyProfileList?.FirstOrDefault()?.IsPro;
                        return dataUser != "0"; // Not Pro remove call
                    }
                    else //all users can chat
                    {
                        return dataSettings?.AudioChat != "0";
                    }
                }
                else if (AppSettings.EnableCall == EnableCall.OnlyVideo && type == TypeCall.Video)
                {
                    if (dataSettings?.WhoCall == "pro") //just pro user can chat 
                    {
                        var dataUser = ListUtils.MyProfileList?.FirstOrDefault()?.IsPro;
                        return dataUser != "0"; // Not Pro remove call
                    }
                    else //all users can chat
                    {
                        return dataSettings?.VideoChat != "0";
                    }
                }
                else if (AppSettings.EnableCall == EnableCall.Disable)
                {
                    return false;
                }

                return false;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return false;
            }
        }

        public static bool GetStatusAds()
        {
            try
            {
                switch (AppSettings.ShowAds)
                {
                    case ShowAds.AllUsers:
                        return true;
                    case ShowAds.UnProfessional:
                        {
                            var isPro = ListUtils.MyProfileList?.FirstOrDefault()?.IsPro ?? "0";
                            if (isPro == "0")
                                return true;
                            else
                                return false;
                        }
                    default:
                        return false;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return false;
            }
        }

        public static bool CheckAllowedDownloadMedia(string type)
        {
            try
            {
                var typeNetwork = Methods.CheckTypeNetwork();
                if (type == "image")
                {
                    switch (typeNetwork)
                    {
                        case "Wifi":
                            return UserDetails.PhotoWifi = MainSettings.SharedData?.GetBoolean("photoWifi_key", true) ?? true;
                        case "Mobile":
                            return UserDetails.PhotoMobile = MainSettings.SharedData?.GetBoolean("photoMobile_key", true) ?? true;
                    }
                }
                else if (type == "video")
                {
                    switch (typeNetwork)
                    {
                        case "Wifi":
                            return UserDetails.VideoWifi = MainSettings.SharedData?.GetBoolean("videoWifi_key", true) ?? true;
                        case "Mobile":
                            return UserDetails.VideoMobile = MainSettings.SharedData?.GetBoolean("videoMobile_key", true) ?? true;
                    }
                }
                //else if (type == "audio")
                //{
                //    switch (typeNetwork)
                //    {
                //        case "Wifi":
                //            return UserDetails.AudioWifi = MainSettings.SharedData?.GetBoolean("audioWifi_key", true) ?? true;
                //        case "Mobile":
                //            return UserDetails.AudioMobile = MainSettings.SharedData?.GetBoolean("audioMobile_key", true) ?? true;
                //    }
                //}
                return true;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return true;
            }
        }

        public static bool IsTabDark()
        {
            try
            {
                return AppSettings.SetTabDarkTheme is TabTheme.Dark;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return false;

            }
        }

        private static readonly string[] RelationshipLocal = Application.Context.Resources?.GetStringArray(Resource.Array.RelationShipArray);
        public static string GetRelationship(int index)
        {
            try
            {
                switch (index)
                {
                    case > -1:
                        {
                            string name = RelationshipLocal[index];
                            return name;
                        }
                    default:
                        return RelationshipLocal?.First() ?? "";
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return "";
            }
        }

        public static bool StoryIsAvailable(string userId)
        {
            try
            {
                var tab = ChatTabbedMainActivity.GetInstance()?.LastStoriesTab;
                var check = tab.MAdapter.StoryList.FirstOrDefault(a => a.UserId == userId)?.Stories;
                if (check?.Count > 0)
                {
                    return true;
                }
                return false;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return false;

            }
        }

        public static string GetDefaultAvatar()
        {
            try
            {
                var local = ListUtils.MyProfileList?.FirstOrDefault();
                if (local != null)
                {
                    if (local.Gender == Application.Context.GetText(Resource.String.Radio_Male))
                    {
                        return "no_profile_image";
                    }
                    else if (local.Gender == Application.Context.GetText(Resource.String.Radio_Female))
                    {
                        return "no_profile_female_image";
                    }
                }

                return "no_profile_image";
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return "no_profile_image";
            }
        }

    }
}