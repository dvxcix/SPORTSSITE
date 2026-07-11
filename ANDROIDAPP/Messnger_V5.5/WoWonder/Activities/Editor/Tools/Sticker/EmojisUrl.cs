using Android.App;
using Java.Lang;
using System.Collections.Generic;
using WoWonder.Activities.Editor.Model;
using WoWonder.Helpers.Utils;
using Exception = System.Exception;

namespace WoWonder.Activities.Editor.Tools.Sticker
{
    public class EmojisUrl
    {
        public static List<StickersModel> EmojiList = new List<StickersModel>();

        public static List<StickersModel> GetEmojis()
        {
            try
            {
                EmojiList = new List<StickersModel>();
                string[] emojiList = Application.Context.Resources.GetStringArray(Resource.Array.NiceArt_emojis);
                foreach (var emojiUnicode in emojiList)
                {
                    EmojiList.Add(new StickersModel()
                    {
                        Type = StickersType.Emoji,
                        Content = ConvertEmoji(emojiUnicode),
                    });
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
            return EmojiList;
        }

        private static string ConvertEmoji(string emoji)
        {
            string returnedEmoji;
            try
            {
                int convertEmojiToInt = Integer.ParseInt(emoji.Substring(2), 16);
                returnedEmoji = new string(Character.ToChars(convertEmojiToInt));
            }
            catch (NumberFormatException e)
            {
                Methods.DisplayReportResultTrack(e);
                returnedEmoji = "";
            }
            return returnedEmoji;
        }
    }
}
