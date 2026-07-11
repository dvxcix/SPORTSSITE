using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using WoWonder.Helpers.Utils;

namespace WoWonder.Activities.ChatGpt
{
    public class OpenAiChatUtils
    {
        private static volatile OpenAiChatUtils InstanceRenamed;
        public static OpenAiChatUtils Instance
        {
            get
            {
                OpenAiChatUtils localInstance = InstanceRenamed;
                if (localInstance == null)
                {
                    lock (typeof(OpenAiChatUtils))
                    {
                        localInstance = InstanceRenamed;
                        if (localInstance == null)
                        {
                            InstanceRenamed = localInstance = new OpenAiChatUtils();
                        }
                    }
                }
                return localInstance;
            }
        }

        public async Task<(int, string)> GetChatSuggestion(string userMessage)
        {
            try
            {
                if (!Methods.CheckConnectivity())
                    return (400, "");

                if (!string.IsNullOrEmpty(ListUtils.SettingsSiteList?.OpenaiToken))
                    return (400, "Error OpenAI Token");

                var requestBody = new
                {
                    model = "gpt-3.5-turbo",
                    messages = new[]
                    {
                        new { role = "system", content = "Suggested messages to reply to the message sent" },
                        new { role = "user", content = userMessage }
                    }
                };

                var client = new HttpClient();
                var request = new HttpRequestMessage
                {
                    Method = HttpMethod.Post,
                    RequestUri = new Uri("https://api.openai.com/v1/chat/completions"),
                    Headers =
                    {
                        {"Authorization", "Bearer " + ListUtils.SettingsSiteList?.OpenaiToken},
                    },
                    Content = new StringContent(JsonConvert.SerializeObject(requestBody), Encoding.UTF8, "application/json")
                };

                var response = await client.SendAsync(request);
                var responseString = await response.Content.ReadAsStringAsync();
                if (response.StatusCode == HttpStatusCode.OK)
                {
                    var result = JsonConvert.DeserializeObject<ChatGptModel>(responseString);
                    if (result != null)
                        return (200, result.Choices?.FirstOrDefault()?.Message?.Content ?? "");
                }
                else
                {
                    string error = JObject.Parse(responseString)["error"]?.ToString() ?? "";
                    if (!string.IsNullOrEmpty(error))
                    {
                        var result = JsonConvert.DeserializeObject<ChatGptErrorModel>(responseString);
                        if (result != null)
                            return (400, result.Message);

                    }
                }
                return (400, "");
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
                return (404, e.Message);
            }
        }

        public async Task<(int, string)> GenerateText(string userMessage)
        {
            try
            {
                if (!Methods.CheckConnectivity())
                    return (400, "");

                if (!string.IsNullOrEmpty(ListUtils.SettingsSiteList?.OpenaiToken))
                    return (400, "Error OpenAI Token");

                var requestBody = new
                {
                    model = "gpt-3.5-turbo",
                    messages = new[]
                    {
                        new { role = "user", content = userMessage }
                    }
                };

                var client = new HttpClient();
                var request = new HttpRequestMessage
                {
                    Method = HttpMethod.Post,
                    RequestUri = new Uri("https://api.openai.com/v1/chat/completions"),
                    Headers =
                    {
                        {"Authorization", "Bearer " + ListUtils.SettingsSiteList?.OpenaiToken},
                    },
                    Content = new StringContent(JsonConvert.SerializeObject(requestBody), Encoding.UTF8, "application/json")
                };

                var response = await client.SendAsync(request);
                var responseString = await response.Content.ReadAsStringAsync();
                if (response.StatusCode == HttpStatusCode.OK)
                {
                    var result = JsonConvert.DeserializeObject<ChatGptModel>(responseString);
                    if (result != null)
                        return (200, result.Choices?.FirstOrDefault()?.Message?.Content ?? "");
                }
                else
                {
                    string error = JObject.Parse(responseString)["error"]?.ToString() ?? "";
                    if (!string.IsNullOrEmpty(error))
                    {
                        var result = JsonConvert.DeserializeObject<ChatGptErrorModel>(responseString);
                        if (result != null)
                            return (400, result.Message);

                    }
                }
                return (400, "");
            }
            catch (Exception e)
            {
                Console.WriteLine(e);
                return (404, e.Message);
            }
        }
    }
}
