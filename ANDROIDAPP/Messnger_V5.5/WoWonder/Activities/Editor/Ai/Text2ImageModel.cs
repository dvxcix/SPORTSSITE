using Newtonsoft.Json;

namespace WoWonder.Activities.Editor.Ai
{
    public class Text2ImageModel
    {
        [JsonProperty("id", NullValueHandling = NullValueHandling.Ignore)]
        public string Id { get; set; }

        [JsonProperty("output_url", NullValueHandling = NullValueHandling.Ignore)]
        public string OutputUrl { get; set; }

        [JsonProperty("share_url", NullValueHandling = NullValueHandling.Ignore)]
        public string ShareUrl { get; set; }

        [JsonProperty("backend_request_id", NullValueHandling = NullValueHandling.Ignore)]
        public string BackendRequestId { get; set; }
    }

}
