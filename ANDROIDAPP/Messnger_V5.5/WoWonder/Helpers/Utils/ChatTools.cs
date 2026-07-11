using Android.App;
using Android.Gms.Maps.Model;
using Android.Graphics;
using Android.Graphics.Drawables;
using Android.Locations;
using Android.OS;
using Android.Util;
using Android.Widget;
using AndroidX.Core.Content;
using Bumptech.Glide;
using Bumptech.Glide.Request.Target;
using Bumptech.Glide.Request.Transition;
using Java.Lang;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Top.Defaults.Drawabletoolbox;
using WoWonder.Activities.ChatWindow;
using WoWonder.Activities.Tab;
using WoWonder.Helpers.Model;
using WoWonderClient;
using WoWonderClient.Classes.Global;
using WoWonderClient.Classes.Message;
using WoWonderClient.Classes.Socket;
using WoWonderClient.Classes.Story;
using Exception = System.Exception;

namespace WoWonder.Helpers.Utils
{
    public enum TypeClick
    {
        Text, Image, Sound, Contact, Video, Sticker, File, Product, Map, Code
    }

    public class ChatTools
    {

        public static PageDataObject FilterDataLastChatPage(PageDataObject item)
        {
            try
            {
                if (item != null)
                {
                    var userAdminPage = item.UserId;
                    var userId = "";
                    if (item.LastMessage?.ToData != null)
                    {
                        if (userAdminPage == item.LastMessage?.ToData?.UserId)
                        {
                            userId = item.LastMessage?.UserData?.UserId;
                            var name = item.LastMessage?.UserData?.Name + " (" + item.PageName + ")";
                            item.PageName = Methods.FunString.SubStringCutOf(Methods.FunString.DecodeString(name), 25);
                        }
                        else
                        {

                            userId = item.LastMessage?.ToData?.UserId;
                            var name = item.LastMessage?.ToData?.Name + " (" + item.PageName + ")";
                            item.PageName = Methods.FunString.SubStringCutOf(Methods.FunString.DecodeString(name), 25);
                        }
                    }
                    else
                    {
                        userId = item.UserId;
                        var name = item.PageName;
                        item.PageName = Methods.FunString.SubStringCutOf(Methods.FunString.DecodeString(name), 25);
                    }

                    //wael change after add in api 
                    item.IsMute = CheckMute(item.ChatId, "page", null);
                    item.IsPin = CheckPin(item.ChatId, "page", null);
                    item.IsArchive = CheckArchive(item.ChatId, "page", null).Item2;

                    item.LastMessage ??= new MessageData();
                    if (!string.IsNullOrEmpty(item.LastMessage.Id))
                    {
                        item.LastMessage.Stickers = item.LastMessage.Stickers != null ? item.LastMessage.Stickers.Replace(".mp4", ".gif") : "";
                        item.LastMessage.ChatColor = AppSettings.MainColor;

                        if (item.LastMessage.Seen != "2")
                        {
                            item.LastMessage.Seen = item.LastMessage.Seen;
                        }
                        else
                            switch (item.LastMessage.Seen)
                            {
                                case "0" when item.LastMessage.Seen == "2":
                                case "1" when item.LastMessage.Seen == "2":
                                    item.LastMessage.Seen = "0";
                                    break;
                            }

                        if (!string.IsNullOrEmpty(item.LastMessage.Text))
                            item.LastMessage.Text = ChatUtils.GetMessage(item.LastMessage.Text, item.LastMessage.Time);

                        if (!string.IsNullOrEmpty(item.LastMessage.Text))
                            item.LastMessage.Text = Methods.FunString.DecodeString(item.LastMessage.Text);

                        switch (string.IsNullOrEmpty(item.LastMessage.Media))
                        {
                            //If message contains Media files 
                            case false when item.LastMessage.Media.Contains("image"):
                                item.LastMessage.Text = Application.Context.GetText(Resource.String.Lbl_SendImageFile);
                                break;
                            case false when item.LastMessage.Media.Contains("video"):
                                item.LastMessage.Text = Application.Context.GetText(Resource.String.Lbl_SendVideoFile);
                                break;
                            case false when item.LastMessage.Media.Contains("sticker"):
                                item.LastMessage.Text = Application.Context.GetText(Resource.String.Lbl_SendStickerFile);
                                break;
                            case false when item.LastMessage.Media.Contains("sounds"):
                                item.LastMessage.Text = Application.Context.GetText(Resource.String.Lbl_SendAudioFile);
                                break;
                            case false when item.LastMessage.Media.Contains("file"):
                                item.LastMessage.Text = Application.Context.GetText(Resource.String.Lbl_SendFile);
                                break;
                            default:
                                {
                                    if (!string.IsNullOrEmpty(item.LastMessage.Stickers) && item.LastMessage.Stickers.Contains(".gif"))
                                    {
                                        item.LastMessage.Text = Application.Context.GetText(Resource.String.Lbl_SendGifFile);
                                    }
                                    else if (!string.IsNullOrEmpty(item.LastMessage.ProductId) && item.LastMessage.ProductId != "0")
                                    {
                                        item.LastMessage.Text = Application.Context.GetText(Resource.String.Lbl_SendProductFile);
                                    }
                                    else if (!string.IsNullOrEmpty(item.LastMessage.Lat) && !string.IsNullOrEmpty(item.LastMessage.Lng) && item.LastMessage.Lat != "0" && item.LastMessage.Lng != "0")
                                    {
                                        item.LastMessage.Text = Application.Context.GetText(Resource.String.Lbl_SendLocationFile);
                                    }
                                    else
                                    {
                                        switch (string.IsNullOrEmpty(item.LastMessage.Text))
                                        {
                                            //if (!string.IsNullOrEmpty(LastMessage.Text) && LastMessage.Text.Contains("http"))
                                            //{
                                            //    item.LastMessage.Text = Methods.FunString.SubStringCutOf(LastMessage.Text, 30);
                                            //}
                                            //else
                                            case false:
                                                {
                                                    if (item.LastMessage.TypeTwo == "contact" || item.LastMessage.Text.Contains("{&quot;Key&quot;") || item.LastMessage.Text.Contains("{key:") || item.LastMessage.Text.Contains("{key:^qu") ||
                                                        item.LastMessage.Text.Contains("{^key:^qu") || item.LastMessage.Text.Contains("{Key:") || item.LastMessage.Text.Contains("&quot;"))
                                                    {
                                                        item.LastMessage.Text = Application.Context.GetText(Resource.String.Lbl_SendContactnumber);
                                                    }
                                                    else
                                                    {
                                                        item.LastMessage.Text = Methods.FunString.DecodeString(Methods.FunString.SubStringCutOf(item.LastMessage.Text, 30));
                                                    }
                                                }
                                                break;
                                        }
                                    }

                                    break;
                                }
                        }
                    }
                }

                return item;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return item;
            }
        }

        public static ChatObject FilterDataLastChatNewV(ChatObject item)
        {
            try
            {
                if (item != null)
                {
                    switch (item.ChatType)
                    {
                        case "user":
                            item.Name = WoWonderTools.GetNameFinal(item);
                            break;
                        case "page":
                            var userAdminPage = item.UserId;
                            if (userAdminPage == item.LastMessage.LastMessageClass?.ToData.UserId)
                            {
                                //var userId = LastMessage.UserData.UserId;
                                var name = item.LastMessage.LastMessageClass?.UserData?.Name + " (" + item.PageName + ")";
                                item.PageName = Methods.FunString.SubStringCutOf(Methods.FunString.DecodeString(name), 25);
                            }
                            else
                            {
                                //var userId = LastMessage.ToData.UserId;
                                var name = item.LastMessage.LastMessageClass?.ToData.Name + " (" + item.PageName + ")";
                                item.PageName = Methods.FunString.SubStringCutOf(Methods.FunString.DecodeString(name), 25);
                            }

                            item.PageName = WoWonderTools.GetNameFinal(item);
                            break;
                        case "group":
                            item.GroupName = Methods.FunString.SubStringCutOf(Methods.FunString.DecodeString(item.GroupName), 25);
                            break;
                    }

                    item.IsMute = CheckMute(item.ChatId, item.ChatType, item.Mute);
                    item.IsPin = CheckPin(item.ChatId, item.ChatType, item.Mute);
                    item.IsArchive = CheckArchive(item.ChatId, item.ChatType, item.Mute).Item2;

                    bool success = int.TryParse(!string.IsNullOrEmpty(item.ChatTime) ? item.ChatTime : item.Time, out var number);
                    if (success)
                    {
                        item.LastseenTimeText = Methods.Time.TimeAgo(number, true);
                    }
                    else
                    {
                        item.LastseenTimeText = Methods.Time.ReplaceTime(!string.IsNullOrEmpty(item.ChatTime) ? item.ChatTime : item.Time);
                    }

                    if (item.LastMessage.LastMessageClass == null)
                        item.LastMessage = new LastMessageUnion
                        {
                            LastMessageClass = new MessageData()
                        };

                    if (!string.IsNullOrEmpty(item.LastMessage.LastMessageClass.Id))
                    {
                        item.LastMessage.LastMessageClass.Media ??= "";
                        item.LastMessage.LastMessageClass.Stickers ??= "";
                        item.LastMessage.LastMessageClass.Text ??= "";

                        item.LastMessage.LastMessageClass.Stickers = item.LastMessage.LastMessageClass.Stickers != null ? item.LastMessage.LastMessageClass.Stickers.Replace(".mp4", ".gif") : "";

                        item.LastMessage.LastMessageClass.Seen = item.LastMessage.LastMessageClass.Seen;

                        //if (item.LastMessage.LastMessageClass.Seen != "2")
                        //{
                        //    item.LastMessage.LastMessageClass.Seen = item.LastMessage.LastMessageClass.Seen;
                        //}
                        //else switch (item.LastMessage.LastMessageClass.Seen)
                        //{
                        //    case "0" when item.LastMessage.LastMessageClass.Seen == "2":
                        //    case "1" when item.LastMessage.LastMessageClass.Seen == "2":
                        //        item.LastMessage.LastMessageClass.Seen = "0";
                        //        break;
                        //}

                        item.LastMessage.LastMessageClass.ChatColor = item.LastMessage.LastMessageClass?.ChatColor ?? AppSettings.MainColor;

                        if (!string.IsNullOrEmpty(item.LastMessage.LastMessageClass.Text))
                            item.LastMessage.LastMessageClass.Text = ChatUtils.GetMessage(item.LastMessage.LastMessageClass.Text, item.LastMessage.LastMessageClass.Time);

                        if (!string.IsNullOrEmpty(item.LastMessage.LastMessageClass.Text))
                            item.LastMessage.LastMessageClass.Text = Methods.FunString.DecodeString(item.LastMessage.LastMessageClass.Text);

                        switch (string.IsNullOrEmpty(item.LastMessage.LastMessageClass.Media))
                        {
                            //If message contains Media files 
                            case false when item.LastMessage.LastMessageClass.Media.Contains("image"):
                                item.LastMessage.LastMessageClass.Text = Application.Context.GetText(Resource.String.Lbl_SendImageFile);
                                break;
                            case false when item.LastMessage.LastMessageClass.Media.Contains("video"):
                                item.LastMessage.LastMessageClass.Text = Application.Context.GetText(Resource.String.Lbl_SendVideoFile);
                                break;
                            case false when item.LastMessage.LastMessageClass.Media.Contains("sticker"):
                                item.LastMessage.LastMessageClass.Text = Application.Context.GetText(Resource.String.Lbl_SendStickerFile);
                                break;
                            case false when item.LastMessage.LastMessageClass.Media.Contains("sounds"):
                                item.LastMessage.LastMessageClass.Text = Application.Context.GetText(Resource.String.Lbl_SendAudioFile);
                                break;
                            case false when item.LastMessage.LastMessageClass.Media.Contains("file"):
                                item.LastMessage.LastMessageClass.Text = Application.Context.GetText(Resource.String.Lbl_SendFile);
                                break;
                            default:
                                {
                                    if (!string.IsNullOrEmpty(item.LastMessage.LastMessageClass.Stickers) && item.LastMessage.LastMessageClass.Stickers.Contains(".gif"))
                                    {
                                        item.LastMessage.LastMessageClass.Text = Application.Context.GetText(Resource.String.Lbl_SendGifFile);
                                    }
                                    else if (!string.IsNullOrEmpty(item.LastMessage.LastMessageClass.ProductId) && item.LastMessage.LastMessageClass.ProductId != "0")
                                    {
                                        item.LastMessage.LastMessageClass.Text = Application.Context.GetText(Resource.String.Lbl_SendProductFile);
                                    }
                                    else if (!string.IsNullOrEmpty(item.LastMessage.LastMessageClass.Lat) && !string.IsNullOrEmpty(item.LastMessage.LastMessageClass.Lng) && item.LastMessage.LastMessageClass.Lat != "0" && item.LastMessage.LastMessageClass.Lng != "0")
                                    {
                                        item.LastMessage.LastMessageClass.Text = Application.Context.GetText(Resource.String.Lbl_SendLocationFile);
                                    }
                                    else
                                    {
                                        if (!string.IsNullOrEmpty(item.LastMessage.LastMessageClass.Text))
                                        {
                                            //if (!string.IsNullOrEmpty(LastMessage.Text) && LastMessage.Text.Contains("http"))
                                            //{
                                            //    item.LastMessage.LastMessageClass.Text = Methods.FunString.SubStringCutOf(LastMessage.Text, 30);
                                            //}
                                            //else

                                            if (item.LastMessage.LastMessageClass.TypeTwo == "contact" || item.LastMessage.LastMessageClass.Text.Contains("{&quot;Key&quot;") || item.LastMessage.LastMessageClass.Text.Contains("{key:") || item.LastMessage.LastMessageClass.Text.Contains("{key:^qu") ||
                                                item.LastMessage.LastMessageClass.Text.Contains("{^key:^qu") || item.LastMessage.LastMessageClass.Text.Contains("{Key:") || item.LastMessage.LastMessageClass.Text.Contains("&quot;"))
                                            {
                                                item.LastMessage.LastMessageClass.Text = Application.Context.GetText(Resource.String.Lbl_SendContactnumber);
                                            }
                                            else
                                            {
                                                if (item.LastMessage.LastMessageClass.Text.Contains("<i class="))
                                                    item.LastMessage.LastMessageClass.Text = ChatTools.GetSmileTypeIcon(item.LastMessage.LastMessageClass.Text);

                                                item.LastMessage.LastMessageClass.Text = Methods.FunString.DecodeString(Methods.FunString.SubStringCutOf(item.LastMessage.LastMessageClass.Text, 30));

                                            }
                                        }
                                    }

                                    break;
                                }
                        }

                    }

                }
                return item;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return item;
            }
        }

        public static MessageDataExtra MessageFilter(string id, MessageData item, MessageModelType modelType, bool showStar = false)
        {
            try
            {
                if (item == null)
                    return null!;

                item.Media ??= "";
                item.Stickers ??= "";

                item.Text ??= "";

                item.Stickers = item.Stickers.Replace(".mp4", ".gif");

                bool success = int.TryParse(item.Time, out var number);
                item.TimeText = success ? Methods.Time.TimeAgo(number) : item.Time;

                item.ModelType = modelType;

                if (item.FromId == UserDetails.UserId) // right
                    item.Position = "right";
                else if (item.ToId == UserDetails.UserId) // left
                    item.Position = "left";

                if (item.Position == "right" && (string.IsNullOrEmpty(item.ChatColor) || item.ChatColor != ChatWindowActivity.MainChatColor))
                    item.ChatColor = ChatWindowActivity.MainChatColor;

                if (showStar && ChatWindowActivity.GetInstance()?.StartedMessageList?.Count > 0)
                {
                    //SqLiteDatabase dbDatabase = new SqLiteDatabase();
                    //item.IsStarted = dbDatabase.IsStartedMessages(item.Id);
                    //
                    var cec = ChatWindowActivity.GetInstance()?.StartedMessageList?.FirstOrDefault(a => a.Id == Long.ParseLong(item.Id))?.MesData;
                    if (cec?.Fav == "yes")
                    {
                        item.Fav = "yes";
                    }
                }

                item.Seen = item.Seen;

                if (!string.IsNullOrEmpty(item.Text))
                {
                    item.Text = ChatUtils.GetMessage(item.Text, item.Time);
                }

                switch (modelType)
                {
                    case MessageModelType.LeftProduct:
                    case MessageModelType.RightProduct:
                        {
                            string imageUrl = item.Product?.ProductClass?.Images[0]?.Image ?? "";
                            var fileName = imageUrl.Split('/').Last();
                            item.Media = WoWonderTools.GetFile(id, Methods.Path.FolderDcimImage, fileName, imageUrl, "product");
                            break;
                        }
                    case MessageModelType.LeftGif:
                    case MessageModelType.RightGif:
                        {
                            //https://media1.giphy.com/media/l0ExncehJzexFpRHq/200.gif?cid=b4114d905d3e926949704872410ec12a&rid=200.gif   
                            //https://media3.giphy.com/media/LSKVlAGSnuXxVdp5wN/200.gif?cid=b4114d90pvb2jy1t65c2dap0se0uc7qef6atvtsxom4cmoi2&rid=200.gif&ct=g
                            string imageUrl = "";
                            if (!string.IsNullOrEmpty(item.Stickers))
                                imageUrl = item.Stickers;
                            else if (!string.IsNullOrEmpty(item.Media))
                                imageUrl = item.Media;
                            else if (!string.IsNullOrEmpty(item.MediaFileName))
                                imageUrl = item.MediaFileName;

                            if (!string.IsNullOrEmpty(imageUrl))
                            {
                                string[] fileName = imageUrl.Split(new[] { "/", "200.gif?cid=", "&rid=200", "&rid=200.gif&ct=g" }, StringSplitOptions.RemoveEmptyEntries);
                                var lastFileName = fileName.Last();
                                var name = fileName[3] + lastFileName;

                                item.Media = WoWonderTools.GetFile(id, Methods.Path.FolderDiskGif, name, imageUrl, "image");
                            }

                            break;
                        }
                    case MessageModelType.LeftText:
                    case MessageModelType.RightText:

                        if (!string.IsNullOrEmpty(item.Text))
                        {
                            item.Text = Methods.FunString.DecodeString(item.Text);

                            if (item.Text.Contains("<i class="))
                                item.Text = ChatTools.GetSmileTypeIcon(item.Text);
                        }

                        //return item;
                        break;
                    case MessageModelType.LeftCode:
                    case MessageModelType.RightCode:

                        if (!string.IsNullOrEmpty(item.Text))
                        {
                            //item.Text = Methods.FunString.DecodeString(item.Text);

                            if (item.Text.Contains("<i class="))
                                item.Text = ChatTools.GetSmileTypeIcon(item.Text);
                        }

                        //return item;
                        break;
                    case MessageModelType.LeftMap:
                    case MessageModelType.RightMap:
                        {
                            //LatLng latLng = new LatLng(Convert.ToDouble(item.Lat), Convert.ToDouble(item.Lng));

                            //var addresses = await ReverseGeocodeCurrentLocation(latLng);
                            //if (addresses != null)
                            //{
                            //    var deviceAddress = addresses.GetAddressLine(0);

                            //    string imageUrlMap = "https://maps.googleapis.com/maps/api/staticmap?";
                            //    //imageUrlMap += "center=" + item.CurrentLatitude + "," + item.CurrentLongitude;
                            //    imageUrlMap += "center=" + deviceAddress;
                            //    imageUrlMap += "&zoom=13";
                            //    imageUrlMap += "&scale=2";
                            //    imageUrlMap += "&size=150x150";
                            //    imageUrlMap += "&maptype=roadmap";
                            //    imageUrlMap += "&key=" + Application.Context.GetText(Resource.String.google_maps_key);
                            //    imageUrlMap += "&format=png";
                            //    imageUrlMap += "&visual_refresh=true";
                            //    imageUrlMap += "&markers=size:small|color:0xff0000|label:1|" + deviceAddress;

                            //    item.MessageMap = imageUrlMap;
                            //}

                            break;
                        }
                    case MessageModelType.LeftImage:
                    case MessageModelType.RightImage:
                        {
                            var fileName = item.Media.Split('/').Last();
                            item.Media = WoWonderTools.GetFile(id, Methods.Path.FolderDcimImage, fileName, item.Media, "image");
                            break;
                        }
                    case MessageModelType.LeftAudio:
                    case MessageModelType.RightAudio:
                        {
                            var fileName = item.Media.Split('/').Last();
                            item.Media = WoWonderTools.GetFile(id, Methods.Path.FolderDcimSound, fileName, item.Media, "audio");

                            if (string.IsNullOrEmpty(item.MediaDuration) || item.MediaDuration == "00:00")
                            {
                                var duration = WoWonderTools.GetDuration(item.Media);
                                item.MediaDuration = Methods.AudioRecorderAndPlayer.GetTimeString(duration);
                            }

                            break;
                        }
                    case MessageModelType.LeftContact:
                    case MessageModelType.RightContact:
                        {
                            if (item.Text.Contains("{&quot;Key&quot;") || item.Text.Contains("{key:") || item.Text.Contains("{key:^qu") || item.Text.Contains("{^key:^qu") || item.Text.Contains("{Key:") || item.Text.Contains("&quot;"))
                            {
                                string[] stringSeparators = { "," };
                                var name = item.Text.Split(stringSeparators, StringSplitOptions.None);
                                var stringName = Methods.FunString.DecodeString(name[0]).Replace("{key:", "").Replace("{Key:", "").Replace("Value:", "").Replace("value:", "").Replace("{", "").Replace("}", "");
                                var stringNumber = Methods.FunString.DecodeString(name[1]).Replace("{key:", "").Replace("{Key:", "").Replace("Value:", "").Replace("value:", "").Replace("{", "").Replace("}", "");
                                item.ContactName = stringName;
                                item.ContactNumber = stringNumber;
                            }

                            break;
                        }
                    case MessageModelType.LeftVideo:
                    case MessageModelType.RightVideo:
                        {
                            var fileName = item.Media.Split('/').Last();
                            if (!string.IsNullOrEmpty(item.MediaFileName))
                                fileName = item.MediaFileName;

                            item.Media = WoWonderTools.GetFile(id, Methods.Path.FolderDcimVideo, fileName, item.Media, "video");
                            var fileNameWithoutExtension = fileName.Split('.').First();

                            var bitmapImage = Methods.MultiMedia.Retrieve_VideoFrame_AsBitmap(Application.Context, item.Media);
                            if (bitmapImage != null)
                            {
                                item.ImageVideo = Methods.Path.FolderDiskVideo + id + "/" + fileNameWithoutExtension + ".png";
                                Methods.MultiMedia.Export_Bitmap_As_Image(bitmapImage, fileNameWithoutExtension, Methods.Path.FolderDiskVideo + id + "/");
                            }
                            else
                            {
                                item.ImageVideo = "";

                                Glide.With(Application.Context)
                                    .AsBitmap()
                                    .Load(item.Media) // or URI/path
                                    .Into(new MySimpleTarget(id, item));
                            }

                            break;
                        }
                    case MessageModelType.LeftSticker:
                    case MessageModelType.RightSticker:
                        {
                            var fileName = item.Media.Split('/').Last();
                            item.Media = WoWonderTools.GetFile(id, Methods.Path.FolderDiskSticker, fileName, item.Media, "sticker");
                            break;
                        }
                    case MessageModelType.LeftFile:
                    case MessageModelType.RightFile:
                        {
                            var fileName = item.Media.Split('/').Last();
                            item.Media = WoWonderTools.GetFile(id, Methods.Path.FolderDcimFile, fileName, item.Media, "file", true);
                            break;
                        }
                }

                if (item.Reply?.ReplyClass?.Id != null && !string.IsNullOrEmpty(item.ReplyId) && item.ReplyId != "0")
                {
                    var type = ChatTools.GetTypeModel(item);
                    if (type != MessageModelType.None)
                    {
                        var msgReply = MessageFilter(id, item.Reply?.ReplyClass, type);
                        item.Reply = new ReplyUnion
                        {
                            ReplyClass = msgReply
                        };
                    }
                }

                if (item.Reply?.ReplyClass == null)
                {
                    item.Reply = new ReplyUnion
                    {
                        ReplyClass = new MessageData()
                    };
                }

                if (item.Story?.StoryClass == null)
                {
                    item.Story = new StoryUnion
                    {
                        StoryClass = new UserDataStory()
                    };
                }

                var db = ClassMapper.Mapper?.Map<MessageDataExtra>(item);
                return db;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                var db = ClassMapper.Mapper?.Map<MessageDataExtra>(item);
                return db;
            }
        }

        #region Location >> BindMap

        public static async Task<Address> ReverseGeocodeCurrentLocation(LatLng latLng)
        {
            try
            {
#pragma warning disable 618
                var locale = (int)Build.VERSION.SdkInt < 25 ? Application.Context.Resources?.Configuration?.Locale : Application.Context.Resources?.Configuration?.Locales.Get(0) ?? Application.Context.Resources?.Configuration?.Locale;
#pragma warning restore 618

                Geocoder geocode = new Geocoder(Application.Context, locale);

                var addresses = await geocode.GetFromLocationAsync(latLng.Latitude, latLng.Longitude, 2); // Here 1 represent max location result to returned, by documents it recommended 1 to 5
                if (addresses?.Count > 0)
                {
                    //string address = addresses[0].GetAddressLine(0); // If any additional address line present than only, check with max available address lines by getMaxAddressLineIndex()
                    //string city = addresses[0].Locality;
                    //string state = addresses[0].AdminArea;
                    //string country = addresses[0].CountryName;
                    //string postalCode = addresses[0].PostalCode;
                    //string knownName = addresses[0].FeatureName; // Only if available else return NULL 
                    return addresses.FirstOrDefault();
                }
                else
                {
                    //Error Message  
                    //ToastUtils.ShowToast(MainActivity, MainActivity.GetText(Resource.String.Lbl_Error_DisplayAddress),ToastLength.Short);
                    return null!;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return null!;
            }
        }

        #endregion


        private class MySimpleTarget : CustomTarget
        {
            private readonly string Id;
            private readonly MessageData Item;
            public MySimpleTarget(string id, MessageData item)
            {
                try
                {
                    Id = id;
                    Item = item;
                }
                catch (Exception e)
                {
                    Methods.DisplayReportResultTrack(e);
                }
            }

            public override void OnResourceReady(Java.Lang.Object resource, ITransition transition)
            {
                try
                {
                    if (Item == null) return;

                    var fileName = Item.Media.Split('/').Last();
                    var fileNameWithoutExtension = fileName.Split('.').First();

                    var pathImage = Methods.Path.FolderDiskVideo + Id + "/" + fileNameWithoutExtension + ".png";

                    var videoImage = Methods.MultiMedia.GetMediaFrom_Gallery(Methods.Path.FolderDiskVideo + Id, fileNameWithoutExtension + ".png");
                    if (videoImage == "File Dont Exists")
                    {
                        if (resource is Bitmap bitmap)
                        {
                            Methods.MultiMedia.Export_Bitmap_As_Image(bitmap, fileNameWithoutExtension, Methods.Path.FolderDiskVideo + Id + "/");

                            Java.IO.File file2 = new Java.IO.File(pathImage);
                            var photoUri = FileProvider.GetUriForFile(Application.Context, Application.Context.PackageName + ".fileprovider", file2);

                            Item.ImageVideo = photoUri.ToString();
                        }
                    }
                    else
                    {

                        Java.IO.File file2 = new Java.IO.File(pathImage);
                        var photoUri = FileProvider.GetUriForFile(Application.Context, Application.Context.PackageName + ".fileprovider", file2);

                        Item.ImageVideo = photoUri.ToString();
                    }
                }
                catch (Exception e)
                {
                    if (Item != null) Item.ImageVideo = "";
                    Methods.DisplayReportResultTrack(e);
                }
            }

            public override void OnLoadCleared(Drawable p0) { }
        }


        public static bool CheckMute(string id, string type, Mute mute)
        {
            try
            {
                if (mute?.Notify == "no")
                {
                    return true;
                }

                var check = ListUtils.MuteList?.FirstOrDefault(a => a.ChatId == id && a.ChatType == type);
                return check != null!;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return false;
            }
        }

        public static bool CheckPin(string id, string type, Mute mute)
        {
            try
            {
                if (mute?.Pin == "yes")
                {
                    return true;
                }

                var check = ListUtils.PinList?.FirstOrDefault(a => a.ChatId == id && a.ChatType == type);
                return check != null!;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return false;
            }
        }

        public static (Classes.LastChatsClass, bool) CheckArchive(string id, string type, Mute mute)
        {
            try
            {
                Classes.LastChatsClass check = ChatTabbedMainActivity.GetInstance()?.ChatTab?.ArchivedChatsTab?.MAdapter?.LastChatsList?.FirstOrDefault(a => a.LastChat?.ChatId == id && a.LastChat?.ChatType == type) ?? null;

                if (mute?.Archive == "yes")
                {
                    return (check, true);
                }

                return (check, check != null);
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return (null, false);
            }
        }

        public static Drawable GetShapeDrawableByThemeColor(Activity mainActivity, string chatColor)
        {
            try
            {
                TypedValue typedValuePrimary = new TypedValue();
                TypedValue typedValueAccent = new TypedValue();
                var theme = mainActivity.Theme;
                theme?.ResolveAttribute(Resource.Attribute.colorPrimary, typedValuePrimary, true);
                theme?.ResolveAttribute(Resource.Attribute.colorAccent, typedValueAccent, true);
                var colorPrimary = new Color(typedValuePrimary.Data);
                var colorAccent = new Color(typedValueAccent.Data);

                string hex1 = "#" + Integer.ToHexString(colorPrimary).Remove(0, 2);
                string hex2 = "#" + Integer.ToHexString(colorAccent).Remove(0, 2);

                var px1 = PixelUtil.DpToPx(mainActivity, 18);
                var px2 = PixelUtil.DpToPx(mainActivity, 5);

                Drawable drawable = new DrawableBuilder()
                    .Rectangle()
                    .CornerRadii(px1, px2, px2, px1)
                    .Gradient()
                    .LinearGradient()
                    .Angle(270)
                    .StartColor(Color.ParseColor(hex2))
                    .EndColor(Color.ParseColor(hex1))
                    .StrokeWidth(0)
                    .Build();

                return drawable;
            }
            catch (Java.Lang.Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return null;
            }
        }

        public static bool ChatIsAllowed(UserDataObject dataObject)
        {
            try
            {
                if (dataObject.MessagePrivacy == "2") //No_body
                {
                    ToastUtils.ShowToast(Application.Context, Application.Context.GetString(Resource.String.Lbl_ChatNotAllowed), ToastLength.Short);
                    return false;
                }
                else if (dataObject.MessagePrivacy == "1") //People_i_Follow
                {
                    if (dataObject.IsFollowing == "1")
                    {
                        return true;
                    }
                    else
                    {
                        ToastUtils.ShowToast(Application.Context, Application.Context.GetString(Resource.String.Lbl_ChatNotAllowed), ToastLength.Short);
                        return false;
                    }
                }
                else if (dataObject.MessagePrivacy == "0") //Everyone
                {
                    return true;
                }

                return true;
            }
            catch (Java.Lang.Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return true;
            }
        }

        public static MessageModelType GetTypeModel(MessageData item)
        {
            try
            {
                MessageModelType modelType;

                if (item.FromId == UserDetails.UserId) // right
                {
                    item.Position = "right";
                }
                else if (item.ToId == UserDetails.UserId) // left
                {
                    item.Position = "left";
                }

                string imageUrl = "", text = "";
                if (!string.IsNullOrEmpty(item.Stickers))
                {
                    item.Stickers = item.Stickers.Replace(".mp4", ".gif");
                    imageUrl = item.Stickers;
                }

                if (!string.IsNullOrEmpty(item.Media))
                    imageUrl = item.Media;

                if (!string.IsNullOrEmpty(item.Text))
                    text = ChatUtils.GetMessage(item.Text, item.Time);

                if (!string.IsNullOrEmpty(imageUrl))
                {
                    var type = Methods.AttachmentFiles.Check_FileExtension(imageUrl);
                    switch (type)
                    {
                        case "Audio":
                            modelType = item.Position == "left" ? MessageModelType.LeftAudio : MessageModelType.RightAudio;
                            break;
                        case "Video":
                            modelType = item.Position == "left" ? MessageModelType.LeftVideo : MessageModelType.RightVideo;
                            break;
                        case "Image" when !string.IsNullOrEmpty(item.Media) && !item.Media.Contains(".gif"):
                            modelType = item.Media.Contains("sticker") ? item.Position == "left" ? MessageModelType.LeftSticker : MessageModelType.RightSticker : item.Position == "left" ? MessageModelType.LeftImage : MessageModelType.RightImage;
                            break;
                        case "File" when !string.IsNullOrEmpty(item.Stickers) && item.Stickers.Contains(".gif"):
                        case "File" when !string.IsNullOrEmpty(item.Media) && item.Media.Contains(".gif"):
                        case "Image" when !string.IsNullOrEmpty(item.Stickers) && item.Stickers.Contains(".gif"):
                        case "Image" when !string.IsNullOrEmpty(item.Media) && item.Media.Contains(".gif"):
                            modelType = item.Position == "left" ? MessageModelType.LeftGif : MessageModelType.RightGif;
                            break;
                        case "File":
                            modelType = item.Position == "left" ? MessageModelType.LeftFile : MessageModelType.RightFile;
                            break;
                        default:
                            modelType = MessageModelType.None;
                            break;
                    }
                }
                else if (!string.IsNullOrEmpty(item.Lat) && !string.IsNullOrEmpty(item.Lng) && item.Lat != "0" && item.Lng != "0")
                    modelType = item.Position == "left" ? MessageModelType.LeftMap : MessageModelType.RightMap;
                else if (item.Product?.ProductClass != null && !string.IsNullOrEmpty(item.ProductId) && item.ProductId != "0")
                    modelType = item.Position == "left" ? MessageModelType.LeftProduct : MessageModelType.RightProduct;
                else if (!string.IsNullOrEmpty(text))
                {
                    if (item.TypeTwo is "contact")
                        modelType = item.Position == "left" ? MessageModelType.LeftContact : MessageModelType.RightContact;
                    else if (item.TypeTwo is "code")
                        modelType = item.Position == "left" ? MessageModelType.LeftCode : MessageModelType.RightCode;
                    else
                    {
                        if (item.Type != null && item.Type.Contains("code"))
                            modelType = item.Position == "left" ? MessageModelType.LeftCode : MessageModelType.RightCode;
                        else
                            modelType = item.Position == "left" ? MessageModelType.LeftText : MessageModelType.RightText;
                    }
                }
                else
                {
                    modelType = MessageModelType.None;
                }

                return modelType;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return MessageModelType.None;
            }
        }

        public static MessageModelType GetTypeModel(PrivateMessageObject item)
        {
            try
            {
                MessageModelType modelType;

                if (item.Sender == UserDetails.UserId) // right
                {
                    item.Position = "right";
                }
                else if (item.Receiver == UserDetails.UserId) // left
                {
                    item.Position = "left";
                }

                string text = "";

                if (!string.IsNullOrEmpty(item.Message))
                    text = ChatUtils.GetMessage(item.Message, item.Time);

                if (!string.IsNullOrEmpty(text))
                {
                    //wael
                    //if (item.Type.Contains("code"))
                    //    modelType = item.Position == "left" ? MessageModelType.LeftCode : MessageModelType.RightCode;
                    //else
                    modelType = item.Position == "left" ? MessageModelType.LeftText : MessageModelType.RightText;
                }

                else if (!string.IsNullOrEmpty(item.Lat) && !string.IsNullOrEmpty(item.Lng) && item.Lat != "0" && item.Lng != "0")
                    modelType = item.Position == "left" ? MessageModelType.LeftMap : MessageModelType.RightMap;

                //if (item == "contact")
                //    modelType = item.Position == "left" ? MessageModelType.LeftContact : MessageModelType.RightContact;

                else if (!string.IsNullOrEmpty(item.MediaLink?.String))
                {
                    var typeFile = Methods.AttachmentFiles.Check_FileExtension(item.MediaLink?.String);
                    switch (typeFile)
                    {
                        case "Audio":
                            modelType = item.Position == "left" ? MessageModelType.LeftAudio : MessageModelType.RightAudio;
                            break;
                        case "Video":
                            modelType = item.Position == "left" ? MessageModelType.LeftVideo : MessageModelType.RightVideo;
                            break;
                        case "Image" when !string.IsNullOrEmpty(item.MediaLink?.String) && !item.MediaLink.Value.String.Contains(".gif") && !item.MessagesHtml.Contains(".gif"):
                            modelType = item.MediaLink.Value.String.Contains("sticker") ? item.Position == "left" ? MessageModelType.LeftSticker : MessageModelType.RightSticker : item.Position == "left" ? MessageModelType.LeftImage : MessageModelType.RightImage;
                            break;
                        case "Image" when !string.IsNullOrEmpty(item.MediaLink?.String) && item.MediaLink.Value.String.Contains(".gif") || item.MessagesHtml.Contains(".gif"):
                            modelType = item.Position == "left" ? MessageModelType.LeftGif : MessageModelType.RightGif;
                            break;
                        case "File":
                            modelType = item.Position == "left" ? MessageModelType.LeftFile : MessageModelType.RightFile;
                            break;
                        default:
                            modelType = MessageModelType.None;
                            break;
                    }
                }
                else
                {
                    modelType = MessageModelType.None;
                }

                return modelType;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return MessageModelType.None;
            }
        }

        public static string GetSmileTypeIcon(string text)
        {
            try
            {
                if (string.IsNullOrEmpty(text))
                    return string.Empty;

                Dictionary<string, string> dictionary = new Dictionary<string, string>
                {
                    {"smile", "😀"},
                    {"joy", "😂"},
                    {"relaxed", "😚"},
                    {"stuck-out-tongue-winking-eye", "😛"},
                    {"stuck-out-tongue", ":😜"},
                    {"sunglasses", "😎"},
                    {"wink", "😉"},
                    {"grin", "😁"},
                    {"smirk", "😏"},
                    {"innocent", "😇"},
                    {"cry", ":😢"},
                    {"sob", ":😭"},
                    {"disappointed", "😞"},
                    {"kissing-heart", "😘"},
                    {"heart", "❤️"},
                    {"broken-heart", "💔"},
                    {"heart-eyes", "😍"},
                    {"star", "⭐"},
                    {"open-mouth", "😦"},
                    {"scream", "😱"},
                    {"anguished", "😨"},
                    {"unamused", "😒"},
                    {"angry", "😡"},
                    {"rage", "😡"},
                    {"expressionless", "😑"},
                    {"confused", ":😕"},
                    {"neutral-face", "😐"},
                    {"exclamation", "❗"},
                    {"yum", "😋"},
                    {"triumph", "😤"},
                    {"imp", "😈"},
                    {"hear-no-evil", "🙉"},
                    {"alien", "👽"},
                    {"yellow-heart", "💛"},
                    {"sleeping", "😴"},
                    {"mask", "😷"},
                    {"no-mouth", "😈"},
                    {"weary", "😩"},
                    {"dizzy-face", "😵"},
                    {"man", "👨"},
                    {"woman", "👩"},
                    {"boy", "👦"},
                    {"girl", "👧"},
                    {"older-man", "👴"},
                    {"older-woman", "👵"},
                    {"cop", "👨‍✈️"},
                    {"dancers", "👯"},
                    {"speak-no-evil", "🙊"},
                    {"lips", "👄"},
                    {"see-no-evil", "🙈"},
                    {"dog", "🐕"},
                    {"bear", "🐻"},
                    {"rose", "🌹"},
                    {"gift-heart", "💝"},
                    {"ghost", "👻"},
                    {"bell", "🔔"},
                    {"video-game", "🎮"},
                    {"soccer", "⚽"},
                    {"books", "📚"},
                    {"moneybag", "💰"},
                    {"mortar-board", "🎓"},
                    {"hand", "🤚"},
                    {"tiger", "🐅"},
                    {"elephant", "🐘"},
                    {"scream-cat", "🙀"},
                    {"monkey", "🐒"},
                    {"bird", "🐦"},
                    {"snowflake", "❄️"},
                    {"sunny", "☀️"},
                    {"оcean", "🌊"},
                    {"umbrella", "☂️"},
                    {"hibiscus", "🌺"},
                    {"tulip", "🌷"},
                    {"computer", "💻"},
                    {"bomb", "💣"},
                    {"gem", "💎"},
                    {"ring", "💍"}
                };

                string pattern = @"(<i class=[""']twa-lg twa twa-(.*?)[""']>)";
                var aa = Regex.Matches(text, pattern);
                if (aa.Count > 0)
                {
                    foreach (var item in aa)
                    {
                        //<i class="twa-lg twa twa-joy">
                        var type = item.ToString().Split("twa-").Last().Replace(">", "").Replace('"', ' ').Replace(" ", "");

                        var containsValue = dictionary.ContainsKey(type);
                        if (containsValue)
                        {
                            var value = dictionary.FirstOrDefault(a => a.Key == type).Value;
                            text = text.Replace(item.ToString(), value);
                        }
                    }
                }

                return text;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return text;
            }
        }

    }
}
