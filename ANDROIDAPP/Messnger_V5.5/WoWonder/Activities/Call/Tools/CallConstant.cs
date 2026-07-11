using System.Collections.Generic;
using WoWonderClient.Classes.Call;
using WoWonderClient.Classes.Message;

namespace WoWonder.Activities.Call.Tools
{
    public class CallConstant
    {
        public static string CallType { get; set; }
        public static CallUserObject CallUserObject { get; set; }
        public static List<CallUserObject> CallUserList = new List<CallUserObject>();

        public static TypeCall TypeCall { get; set; }

        public static bool CallActive { get; set; }
        public static bool IsCallActivityVisible { get; set; }
        public static bool IsSpeakerEnabled { get; set; }
    }
}
