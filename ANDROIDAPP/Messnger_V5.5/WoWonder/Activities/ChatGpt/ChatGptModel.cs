using Newtonsoft.Json;
using System.Collections.Generic;

namespace WoWonder.Activities.ChatGpt
{
    public class ChatGptModel
    {
        [JsonProperty("id", NullValueHandling = NullValueHandling.Ignore)]
        public string Id { get; set; }

        [JsonProperty("object", NullValueHandling = NullValueHandling.Ignore)]
        public string Object { get; set; }

        [JsonProperty("created", NullValueHandling = NullValueHandling.Ignore)]
        public string Created { get; set; }

        [JsonProperty("model", NullValueHandling = NullValueHandling.Ignore)]
        public string Model { get; set; }

        [JsonProperty("choices", NullValueHandling = NullValueHandling.Ignore)]
        public List<Choice> Choices { get; set; }

        public class Choice
        {
            [JsonProperty("index", NullValueHandling = NullValueHandling.Ignore)]
            public string Index { get; set; }

            [JsonProperty("message", NullValueHandling = NullValueHandling.Ignore)]
            public Message Message { get; set; }
        }

        public class Message
        {
            [JsonProperty("role", NullValueHandling = NullValueHandling.Ignore)]
            public string Role { get; set; }

            [JsonProperty("content", NullValueHandling = NullValueHandling.Ignore)]
            public string Content { get; set; }
        }
    }

    public class ChatGptErrorModel
    {
        [JsonProperty("message", NullValueHandling = NullValueHandling.Ignore)]
        public string Message { get; set; }

        [JsonProperty("type", NullValueHandling = NullValueHandling.Ignore)]
        public string Type { get; set; }

        [JsonProperty("code", NullValueHandling = NullValueHandling.Ignore)]
        public string Code { get; set; }
    }
}
