using Android.App;
using Android.Content;
using Android.Widget;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using WoWonder.Helpers.Utils;

namespace WoWonder.Activities.Editor.Ai
{
    public class GenerateImageAi
    {
        private static readonly string ArtUrl = "https://api.deepai.org/api/text2img";

        private static readonly string KeyDeepAi = "57469926-b75d-439b-a284-52d7ec4cf944";

        private int UsageCount;
        private long LastUsageTimestamp;
        private long CurrentTime;

        private static readonly string PrefsName = "GenerateAi";
        private static readonly string KeyUsageCount = "usageCount";
        private static readonly string KeyLastUsageTimestamp = "lastUsageTimestamp";
        private static readonly int MaxUsageLimit = 3;
        private static readonly long TimeLimitMillis = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

        private ISharedPreferences SharedData;

        private static volatile GenerateImageAi _instanceRenamed;
        public static GenerateImageAi Instance
        {
            get
            {
                GenerateImageAi localInstance = _instanceRenamed;
                if (localInstance == null)
                {
                    lock (typeof(GenerateImageAi))
                    {
                        localInstance = _instanceRenamed;
                        if (localInstance == null)
                        {
                            _instanceRenamed = localInstance = new GenerateImageAi();
                        }
                    }
                }
                return localInstance;
            }
        }

        public bool CheckGenerateImageAi(Context context)
        {
            try
            {
                var isPro = ListUtils.MyProfileList?.FirstOrDefault()?.IsPro ?? "0";

                SharedData = context.GetSharedPreferences(PrefsName, FileCreationMode.Private);

                UsageCount = SharedData.GetInt(KeyUsageCount, 0);
                LastUsageTimestamp = SharedData.GetLong(KeyLastUsageTimestamp, 0);

                CurrentTime = Methods.Time.CurrentTimeMillis();
                long timeSinceLastUsage = CurrentTime - LastUsageTimestamp;
                if (timeSinceLastUsage >= TimeLimitMillis)
                {
                    UsageCount = 0;
                }

                if (UsageCount >= MaxUsageLimit && isPro == "0")
                {
                    Toast.MakeText(context, context.GetText(Resource.String.Lbl_ErrorLimitGenerateAi), ToastLength.Short).Show();
                    return false;
                }
                else
                {
                    return true;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return false;
            }
        }

        public async Task<string> GenerateImage(string text)
        {
            try
            {
                if (!CheckGenerateImageAi(Application.Context))
                    return "";

                var content = new FormUrlEncodedContent(new List<KeyValuePair<string, string>>()
                {
                    new KeyValuePair<string, string>("text", text)
                });
                var client = new HttpClient();
                var request = new HttpRequestMessage
                {
                    Method = HttpMethod.Post,
                    RequestUri = new Uri(ArtUrl),
                    Content = content,
                    Headers =
                    {
                        {"api-key", KeyDeepAi},
                    }
                };

                var response = await client.SendAsync(request);
                string json = await response.Content.ReadAsStringAsync();

                var data = JsonConvert.DeserializeObject<Text2ImageModel>(json);
                if (data != null)
                {
                    UsageCount++;
                    LastUsageTimestamp = CurrentTime;

                    // Save the updated values to shared preferences
                    var editor = SharedData.Edit();
                    if (editor != null)
                    {
                        editor.PutInt(KeyUsageCount, UsageCount);
                        editor.PutLong(KeyLastUsageTimestamp, LastUsageTimestamp);
                        editor.Apply();
                    }

                    return data.OutputUrl;
                }
                return "";
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return "";
            }
        }
    }
}
