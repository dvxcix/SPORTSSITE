using Android.Content;
using Android.Content.Res;
using Android.Graphics;
using Android.Views;
using AndroidX.AppCompat.App;
using AndroidX.RecyclerView.Widget;
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using WoWonder.Activities.DefaultUser;
using WoWonder.Adapters;
using WoWonder.Helpers.Controller;
using WoWonder.Helpers.Model;
using WoWonder.Helpers.Utils;
using WoWonder.Library.Anjo.SuperTextLibrary;
using WoWonder.SQLite;
using WoWonderClient.Classes.Message;
using static WoWonder.Adapters.Holders;

namespace WoWonder.Activities.ChatGpt.Adapters
{
    public class ChatGptAdapters : RecyclerView.Adapter, StTools.IXAutoLinkOnClickListener
    {
        public event EventHandler<MesClickEventArgs> ItemClick;
        public event EventHandler<MesClickEventArgs> ItemLongClick;

        private readonly AppCompatActivity ActivityContext;
        public ObservableCollection<AdapterModelsClassMessage> ContentList = new ObservableCollection<AdapterModelsClassMessage>();
        public StReadMoreOption ReadMoreOption { get; }

        public ChatGptAdapters(AppCompatActivity activity)
        {
            try
            {
                HasStableIds = true;
                ActivityContext = activity;
                ReadMoreOption = new StReadMoreOption.Builder()
                    .TextLength(400, StReadMoreOption.TypeCharacter)
                    .MoreLabel(activity.GetText(Resource.String.Lbl_ReadMore))
                    .LessLabel(activity.GetText(Resource.String.Lbl_ReadLess))
                    .MoreLabelColor(Color.ParseColor(AppSettings.MainColor))
                    .LessLabelColor(Color.ParseColor(AppSettings.MainColor))
                    .LabelUnderLine(true)
                    .Build();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override int ItemCount => ContentList?.Count ?? 0;

        // Create new views (invoked by the layout manager)
        public override RecyclerView.ViewHolder OnCreateViewHolder(ViewGroup parent, int viewType)
        {
            try
            {
                switch (viewType)
                {
                    case (int)MessageModelType.RightText:
                        {
                            View row = LayoutInflater.From(parent.Context)?.Inflate(Resource.Layout.Right_MS_view, parent, false);
                            Holders.TextViewHolder textViewHolder = new Holders.TextViewHolder(row, OnClick, OnLongClick, false);
                            return textViewHolder;
                        }
                    case (int)MessageModelType.LeftText:
                        {
                            View row = LayoutInflater.From(parent.Context)?.Inflate(Resource.Layout.Left_MS_view, parent, false);
                            Holders.TextViewHolder textViewHolder = new Holders.TextViewHolder(row, OnClick, OnLongClick, false);
                            return textViewHolder;
                        }
                    default:
                        {
                            View row = LayoutInflater.From(parent.Context)?.Inflate(Resource.Layout.Left_MS_view, parent, false);
                            Holders.NotSupportedViewHolder viewHolder = new Holders.NotSupportedViewHolder(row);
                            return viewHolder;
                        }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return null!;
            }
        }

        // Replace the contents of a view (invoked by the layout manager)
        public override void OnBindViewHolder(RecyclerView.ViewHolder viewHolder, int position)
        {
            try
            {
                var item = ContentList[position];

                var itemViewType = viewHolder.ItemViewType;
                switch (itemViewType)
                {

                    case (int)MessageModelType.RightText:
                    case (int)MessageModelType.LeftText:
                        {
                            Holders.TextViewHolder holder = viewHolder as Holders.TextViewHolder;
                            LoadTextOfChatItem(holder, position, item.MesData);
                            break;
                        }
                    default:
                        {
                            if (!string.IsNullOrEmpty(item.MesData.Text) || !string.IsNullOrWhiteSpace(item.MesData.Text))
                            {
                                if (viewHolder is Holders.TextViewHolder holderText)
                                {
                                    LoadTextOfChatItem(holderText, position, item.MesData);
                                }
                            }
                            else
                            {
                                if (viewHolder is Holders.NotSupportedViewHolder holder)
                                    holder.AutoLinkNotsupportedView.Text = ActivityContext.GetText(Resource.String.Lbl_TextChatNotSupported);
                            }
                            break;
                        }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private void LoadTextOfChatItem(TextViewHolder holder, int position, MessageDataExtra message)
        {
            try
            {
                holder.ImageCountLike.Visibility = ViewStates.Gone;
                holder.StarIcon.Visibility = ViewStates.Gone;
                holder.StarImage.Visibility = ViewStates.Gone;
                holder.StarLayout.Visibility = ViewStates.Gone;
                holder.StarLayout.Visibility = ViewStates.Gone;

                if (message.Position == "right")
                {
                    holder.Seen.Visibility = ViewStates.Gone;

                    holder.BubbleLayout.BackgroundTintList = ColorStateList.ValueOf(Color.ParseColor(message.ChatColor));
                }

                holder.Time.Text = message.TimeText;

                holder.SuperTextView?.SetAutoLinkOnClickListener(this, new Dictionary<string, string>());
                holder.SuperTextView.Text = message.Text;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public AdapterModelsClassMessage GetItem(int position)
        {
            return ContentList[position];
        }

        public override long GetItemId(int position)
        {
            return position;
        }

        public override int GetItemViewType(int position)
        {
            try
            {
                var item = ContentList[position];
                if (item == null)
                    return (int)MessageModelType.None;

                switch (item.TypeView)
                {
                    case MessageModelType.RightText:
                        return (int)MessageModelType.RightText;
                    case MessageModelType.LeftText:
                        return (int)MessageModelType.LeftText;
                    default:
                        return (int)MessageModelType.None;
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return (int)MessageModelType.None;
            }
        }

        private void OnClick(MesClickEventArgs args)
        {
            ItemClick?.Invoke(this, args);
        }

        private void OnLongClick(MesClickEventArgs args)
        {
            ItemLongClick?.Invoke(this, args);
        }


        public void AutoLinkTextClick(StTools.XAutoLinkMode autoLinkMode, string matchedText, Dictionary<string, string> userData)
        {
            try
            {
                var typetext = Methods.FunString.Check_Regex(matchedText.Replace(" ", "").Replace("\n", "").Replace("\n", ""));
                if (typetext == "Email" || autoLinkMode == StTools.XAutoLinkMode.ModeEmail)
                {
                    Methods.App.SendEmail(ActivityContext, matchedText.Replace(" ", "").Replace("\n", ""));
                }
                else if (typetext == "Website" || autoLinkMode == StTools.XAutoLinkMode.ModeUrl)
                {
                    string url = matchedText.Replace(" ", "").Replace("\n", "");
                    if (!matchedText.Contains("http"))
                    {
                        url = "http://" + matchedText.Replace(" ", "").Replace("\n", "");
                    }

                    //var intent = new Intent(ActivityContext, typeof(LocalWebViewActivity));
                    //intent.PutExtra("URL", url);
                    //intent.PutExtra("Type", url);
                    //ActivityContext.StartActivity(intent);
                    new IntentController(ActivityContext).OpenBrowserFromApp(url);
                }
                else if (typetext == "Hashtag" || autoLinkMode == StTools.XAutoLinkMode.ModeHashTag)
                {

                }
                else if (typetext == "Mention" || autoLinkMode == StTools.XAutoLinkMode.ModeMention)
                {
                    var dataUSer = ListUtils.MyProfileList?.FirstOrDefault();
                    string name = matchedText.Replace("@", "").Replace(" ", "");

                    var sqlEntity = new SqLiteDatabase();
                    var user = sqlEntity.Get_DataOneUser(name);

                    if (user != null)
                    {
                        WoWonderTools.OpenProfile(ActivityContext, user.UserId, user);
                    }
                    else
                    {
                        if (name == dataUSer?.Name || name == dataUSer?.Username)
                        {
                            var intent = new Intent(ActivityContext, typeof(MyProfileActivity));
                            ActivityContext.StartActivity(intent);
                        }
                        else
                        {
                            var intent = new Intent(ActivityContext, typeof(UserProfileActivity));
                            //intent.PutExtra("UserObject", JsonConvert.SerializeObject(item));
                            intent.PutExtra("name", name);
                            ActivityContext.StartActivity(intent);
                        }
                    }
                }
                else if (typetext == "Number" || autoLinkMode == StTools.XAutoLinkMode.ModePhone)
                {
                    Methods.App.SaveContacts(ActivityContext, matchedText.Replace(" ", "").Replace("\n", ""), "", "2");
                }
            }
            catch (Exception exception)
            {
                Methods.DisplayReportResultTrack(exception);
            }
        }


    }
}