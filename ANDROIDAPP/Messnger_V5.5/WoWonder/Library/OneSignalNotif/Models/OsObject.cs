using Newtonsoft.Json;

namespace WoWonder.Library.OneSignalNotif.Models
{
    public class OsObject
    {
        public class OsNotificationObject
        {
            [JsonProperty("post_id", NullValueHandling = NullValueHandling.Ignore)]
            public string PostId { get; set; }

            [JsonProperty("user_id", NullValueHandling = NullValueHandling.Ignore)]
            public string UserId { get; set; }

            [JsonProperty("page_id", NullValueHandling = NullValueHandling.Ignore)]
            public string PageId { get; set; }

            [JsonProperty("group_id", NullValueHandling = NullValueHandling.Ignore)]
            public string GroupId { get; set; }

            [JsonProperty("event_id", NullValueHandling = NullValueHandling.Ignore)]
            public string EventId { get; set; }

            [JsonProperty("chat_type", NullValueHandling = NullValueHandling.Ignore)]
            public string ChatType { get; set; }

            [JsonProperty("type", NullValueHandling = NullValueHandling.Ignore)]
            public string Type { get; set; }

            [JsonProperty("call_type", NullValueHandling = NullValueHandling.Ignore)]
            public string CallType { get; set; }

            [JsonProperty("url", NullValueHandling = NullValueHandling.Ignore)]
            public string Url { get; set; }

        }
    }
}