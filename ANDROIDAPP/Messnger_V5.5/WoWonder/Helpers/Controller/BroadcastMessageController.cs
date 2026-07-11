using Android.Widget;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using WoWonder.Activities.Broadcast;
using WoWonder.Activities.Tab;
using WoWonder.Helpers.Jobs;
using WoWonder.Helpers.Model;
using WoWonder.Helpers.Utils;
using WoWonder.SQLite;
using WoWonderClient.Classes.Message;
using WoWonderClient.JobWorker;
using WoWonderClient.Requests;

namespace WoWonder.Helpers.Controller
{
    public class BroadcastMessageController
    {
        //############# DONT'T MODIFY HERE ############# 
        private static BroadcastChatWindowActivity MainWindowActivity;
        private static ChatTabbedMainActivity GlobalContext;

        //========================= Functions ========================= 
        public static async Task SendMessageTask(BroadcastChatWindowActivity windowActivity, string id, string messageId, string text = "", string contact = "", string pathFile = "", string imageUrl = "", string stickerId = "", string gifUrl = "", string lat = "", string lng = "", string replyId = "")
        {
            try
            {
                MainWindowActivity = windowActivity;
                GlobalContext = ChatTabbedMainActivity.GetInstance();

                if (!string.IsNullOrEmpty(pathFile))
                {
                    new UploadSingleFileToServerWorker(windowActivity, "BroadcastChatWindowActivity").UploadFileToServer(windowActivity, new FileModel
                    {
                        MessageHashId = messageId,
                        BroadcastId = id,
                        FilePath = pathFile,
                        ReplyId = replyId,
                    });
                }
                else
                {
                    StartApiService(id, messageId, text, contact, pathFile, imageUrl, stickerId, gifUrl, lat, lng, replyId);
                }
            }
            catch (Exception ex)
            {
                await Task.CompletedTask;
                Methods.DisplayReportResultTrack(ex);
            }
        }

        private static void StartApiService(string id, string messageId, string text = "", string contact = "", string pathFile = "", string imageUrl = "", string stickerId = "", string gifUrl = "", string lat = "", string lng = "", string replyId = "")
        {
            if (!Methods.CheckConnectivity())
                ToastUtils.ShowToast(MainWindowActivity, MainWindowActivity.GetString(Resource.String.Lbl_CheckYourInternetConnection), ToastLength.Short);
            else
                PollyController.RunRetryPolicyFunction(new List<Func<Task>> { () => SendMessage(id, messageId, text, contact, pathFile, imageUrl, stickerId, gifUrl, lat, lng, replyId) });
        }

        private static async Task SendMessage(string id, string messageId, string text = "", string contact = "", string pathFile = "", string imageUrl = "", string stickerId = "", string gifUrl = "", string lat = "", string lng = "", string replyId = "")
        {
            var (apiStatus, respond) = await RequestsAsync.Broadcast.SendBroadcastMessageAsync(id, messageId, text, contact, pathFile, imageUrl, stickerId, gifUrl, lat, lng, replyId);
            if (apiStatus == 200)
            {
                if (respond is SendMessageObject result)
                {
                    UpdateLastIdMessage(result);
                }
            }
            else Methods.DisplayReportResult(MainWindowActivity, respond);
        }

        public static void UpdateLastIdMessage(SendMessageObject chatMessages)
        {
            try
            {
                MessageData messageInfo = chatMessages?.MessageData?.FirstOrDefault();
                if (messageInfo != null)
                {
                    var typeModel = ChatTools.GetTypeModel(messageInfo);
                    if (typeModel == MessageModelType.None)
                        return;

                    AdapterModelsClassMessage checker = MainWindowActivity?.MAdapter?.DifferList?.FirstOrDefault(a => a.MesData?.Id == messageInfo.MessageHashId);
                    if (checker != null)
                    {
                        var message = ChatTools.MessageFilter(messageInfo.ToId, messageInfo, typeModel, true);
                        message.ModelType = typeModel;
                        message.ErrorSendMessage = false;
                        message.Seen ??= "0";
                        message.BtnDownload = true;

                        checker.MesData = message;
                        checker.Id = Java.Lang.Long.ParseLong(message.Id);
                        checker.TypeView = typeModel;

                        //Update All data users to database
                        SqLiteDatabase dbDatabase = new SqLiteDatabase();
                        dbDatabase.Insert_Or_Update_To_one_BroadcastMessagesTable(checker.MesData);

                        MainWindowActivity?.RunOnUiThread(() =>
                        {
                            try
                            {
                                //Update data RecyclerView Messages.
                                //if (message.ModelType == MessageModelType.RightSticker || message.ModelType == MessageModelType.RightImage || message.ModelType == MessageModelType.RightMap || message.ModelType == MessageModelType.RightVideo)
                                MainWindowActivity?.UpdateOneMessage(checker.MesData);

                                if (UserDetails.SoundControl)
                                    Methods.AudioRecorderAndPlayer.PlayAudioFromAsset("Popup_SendMesseges.mp3");
                            }
                            catch (Exception e)
                            {
                                Methods.DisplayReportResultTrack(e);
                            }
                        });

                        #region LastChat

                        if (MainWindowActivity?.BroadcastData?.Users?.Count > 0)
                        {
                            Task.Factory.StartNew(() =>
                            {
                                try
                                {
                                    foreach (var user in MainWindowActivity.BroadcastData.Users)
                                    {
                                        var updaterUser = GlobalContext?.ChatTab?.LastChatTab?.MAdapter?.LastChatsList?.FirstOrDefault(a => a.LastChat?.UserId == user.UserId && a.LastChat?.ChatType == "user");
                                        if (updaterUser?.LastChat != null)
                                        {
                                            updaterUser.LastChat.ChatTime = message.Time;
                                            updaterUser.LastChat.LastMessage = new LastMessageUnion()
                                            {
                                                LastMessageClass = message
                                            };

                                            var index = GlobalContext.ChatTab.LastChatTab.MAdapter.LastChatsList.IndexOf(updaterUser);
                                            if (index > -1)
                                            {
                                                updaterUser.LastChat.LastMessage.LastMessageClass.Text = typeModel switch
                                                {
                                                    MessageModelType.RightGif => MainWindowActivity?.GetText(Resource.String.Lbl_SendGifFile),
                                                    MessageModelType.RightText => !string.IsNullOrEmpty(message.Text) ? Methods.FunString.DecodeString(message.Text) : MainWindowActivity?.GetText(Resource.String.Lbl_SendMessage),
                                                    MessageModelType.RightSticker => MainWindowActivity?.GetText(Resource.String.Lbl_SendStickerFile),
                                                    MessageModelType.RightContact => MainWindowActivity?.GetText(Resource.String.Lbl_SendContactnumber),
                                                    MessageModelType.RightFile => MainWindowActivity?.GetText(Resource.String.Lbl_SendFile),
                                                    MessageModelType.RightVideo => MainWindowActivity?.GetText(Resource.String.Lbl_SendVideoFile),
                                                    MessageModelType.RightImage => MainWindowActivity?.GetText(Resource.String.Lbl_SendImageFile),
                                                    MessageModelType.RightAudio => MainWindowActivity?.GetText(Resource.String.Lbl_SendAudioFile),
                                                    MessageModelType.RightMap => MainWindowActivity?.GetText(Resource.String.Lbl_SendLocationFile),
                                                    _ => updaterUser.LastChat?.LastMessage.LastMessageClass.Text
                                                };

                                                GlobalContext?.RunOnUiThread(() =>
                                                {
                                                    try
                                                    {
                                                        if (updaterUser.LastChat.Mute?.Pin == "no")
                                                        {
                                                            var checkPin = GlobalContext?.ChatTab?.LastChatTab?.MAdapter?.LastChatsList?.LastOrDefault(o => o.LastChat != null && o.LastChat.Mute?.Pin == "yes");
                                                            if (checkPin != null)
                                                            {
                                                                var toIndex = GlobalContext.ChatTab.LastChatTab.MAdapter.LastChatsList.IndexOf(checkPin) + 1;

                                                                if (index != toIndex)
                                                                {
                                                                    GlobalContext?.ChatTab?.LastChatTab?.MAdapter?.LastChatsList?.Move(index, toIndex);
                                                                    GlobalContext?.ChatTab?.LastChatTab?.MAdapter?.NotifyItemMoved(index, toIndex);
                                                                }

                                                                GlobalContext?.ChatTab?.LastChatTab?.MAdapter?.NotifyItemChanged(toIndex, "WithoutBlobText");
                                                            }
                                                            else
                                                            {
                                                                if (ListUtils.FriendRequestsList.Count > 0)
                                                                {
                                                                    if (index != 1)
                                                                    {
                                                                        GlobalContext?.ChatTab?.LastChatTab?.MAdapter?.LastChatsList?.Move(index, 1);
                                                                        GlobalContext?.ChatTab?.LastChatTab?.MAdapter?.NotifyItemMoved(index, 1);
                                                                    }

                                                                    GlobalContext?.ChatTab?.LastChatTab?.MAdapter?.NotifyItemChanged(1, "WithoutBlobText");
                                                                }
                                                                else
                                                                {
                                                                    if (index != 0)
                                                                    {
                                                                        GlobalContext?.ChatTab?.LastChatTab?.MAdapter?.LastChatsList?.Move(index, 0);
                                                                        GlobalContext?.ChatTab?.LastChatTab?.MAdapter?.NotifyItemMoved(index, 0);
                                                                    }

                                                                    GlobalContext?.ChatTab?.LastChatTab?.MAdapter?.NotifyItemChanged(0, "WithoutBlobText");
                                                                }
                                                            }
                                                        }
                                                        else
                                                        {
                                                            GlobalContext?.ChatTab?.LastChatTab?.MAdapter?.NotifyItemChanged(index, "WithoutBlobText");
                                                        }
                                                    }
                                                    catch (Exception e)
                                                    {
                                                        Methods.DisplayReportResultTrack(e);
                                                    }
                                                });

                                                SqLiteDatabase dbSqLite = new SqLiteDatabase();
                                                //Update All data users to database
                                                dbSqLite.Insert_Or_Update_one_LastUsersChat(updaterUser?.LastChat);
                                            }
                                        }
                                    }
                                }
                                catch (Exception e)
                                {
                                    Methods.DisplayReportResultTrack(e);
                                }
                            }).ConfigureAwait(false);
                        }

                        #endregion
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }
}