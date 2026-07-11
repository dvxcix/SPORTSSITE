using Android.App;
using Android.Views;
using Android.Widget;
using AndroidX.RecyclerView.Widget;
using Bumptech.Glide;
using Bumptech.Glide.Request;
using System;
using System.Collections.ObjectModel;
using System.Linq;
using WoWonder.Activities.Editor.Model;
using WoWonder.Helpers.Utils;

namespace WoWonder.Activities.Editor.Tools.Crop
{
    internal class AspectRatioPreviewAdapter : RecyclerView.Adapter
    {
        public event EventHandler<AspectRatioPreviewAdapterClickEventArgs> ItemClick;
        public event EventHandler<AspectRatioPreviewAdapterClickEventArgs> ItemLongClick;

        private readonly Activity ActivityContext;
        public readonly ObservableCollection<AspectRatioModel> RatiosList = new ObservableCollection<AspectRatioModel>();

        public AspectRatioPreviewAdapter(Activity context)
        {
            try
            {
                HasStableIds = true;
                ActivityContext = context;
                LoadRatios();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override int ItemCount => RatiosList?.Count ?? 0;

        // Create new views (invoked by the layout manager) 
        public override RecyclerView.ViewHolder OnCreateViewHolder(ViewGroup parent, int viewType)
        {
            try
            {
                //Setup your layout here >> item_aspect_ratio_style
                var itemView = LayoutInflater.From(parent.Context)?.Inflate(Resource.Layout.item_aspect_ratio_style, parent, false);
                var vh = new AspectRatioPreviewAdapterViewHolder(itemView, OnClick, OnLongClick);
                return vh;
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
                if (viewHolder is AspectRatioPreviewAdapterViewHolder holder)
                {
                    var item = RatiosList[position];
                    if (item != null)
                    {
                        if (item.Id == 1)
                        {
                            holder.AspectRatioPreview.SetImageResource(item.ItemSelected ? Resource.Drawable.ic_crop_free : Resource.Drawable.ic_crop_free_click);
                        }
                        else
                        {
                            if (item.ItemSelected)
                            {
                                Glide.With(ActivityContext?.BaseContext).Load(item.GetSelectedIem()).Apply(new RequestOptions()).Into(holder.AspectRatioPreview);
                            }
                            else
                            {
                                Glide.With(ActivityContext?.BaseContext).Load(item.GetUnselectItem()).Apply(new RequestOptions()).Into(holder.AspectRatioPreview);
                            }
                        }

                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void Click_item(AspectRatioModel item)
        {
            try
            {
                var check = RatiosList.Where(a => a.ItemSelected).ToList();
                if (check.Count > 0)
                    foreach (var all in check)
                        all.ItemSelected = false;

                var click = RatiosList.FirstOrDefault(a => a.Id == item.Id);
                if (click != null) click.ItemSelected = true;

                NotifyDataSetChanged();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public AspectRatioModel GetItem(int position)
        {
            return RatiosList[position];
        }

        public override long GetItemId(int position)
        {
            try
            {
                return position;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return 0;
            }
        }

        public override int GetItemViewType(int position)
        {
            try
            {
                return 0;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return 0;
            }
        }

        private void LoadRatios()
        {
            try
            {
                RatiosList.Add(new AspectRatioModel(1, 10, 10, "", ""));
                RatiosList.Add(new AspectRatioModel(2, 1, 1, "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480662/ratio_1_1_scffz7.png", "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480662/ratio_1_1_click_gaenkr.png"));
                RatiosList.Add(new AspectRatioModel(3, 4, 3, "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480658/ratio_4_3_muqxs1.png", "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480659/ratio_4_3_click_ebcpxu.png"));
                RatiosList.Add(new AspectRatioModel(4, 3, 4, "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480657/ratio_3_4_fn7sfv.png", "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480658/ratio_3_4_click_zdxxao.png"));
                RatiosList.Add(new AspectRatioModel(5, 5, 4, "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480660/ratio_5_4_azeqnl.png", "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480660/ratio_5_4_click_sss715.png"));
                RatiosList.Add(new AspectRatioModel(6, 4, 5, "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480659/ratio_4_5_owyc3t.png", "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480660/ratio_4_5_click_jtbxqy.png"));
                RatiosList.Add(new AspectRatioModel(7, 3, 2, "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480657/ratio_3_2_j3zyzb.png", "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480657/ratio_3_2_click_lzwexx.png"));
                RatiosList.Add(new AspectRatioModel(8, 2, 3, "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480662/ratio_2_3_uxqfod.png", "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480656/ratio_2_3_click_adopro.png"));
                RatiosList.Add(new AspectRatioModel(9, 9, 16, "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480661/ratio_9_16_wmacpz.png", "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480662/ratio_9_16_click_fw1xpj.png"));
                RatiosList.Add(new AspectRatioModel(10, 16, 9, "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480661/ratio_16_9_yfv6qd.png", "https://res.cloudinary.com/dyvrnfxhp/image/upload/v1740480662/ratio_16_9_click_jkagbr.png"));
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnClick(AspectRatioPreviewAdapterClickEventArgs args) => ItemClick?.Invoke(this, args);
        public void OnLongClick(AspectRatioPreviewAdapterClickEventArgs args) => ItemLongClick?.Invoke(this, args);
    }

    public class AspectRatioPreviewAdapterViewHolder : RecyclerView.ViewHolder
    {
        public ImageView AspectRatioPreview { get; private set; }

        public View MainView { get; }

        public AspectRatioPreviewAdapterViewHolder(View itemView, Action<AspectRatioPreviewAdapterClickEventArgs> clickListener, Action<AspectRatioPreviewAdapterClickEventArgs> longClickListener) : base(itemView)
        {
            try
            {
                MainView = itemView;

                AspectRatioPreview = itemView.FindViewById<ImageView>(Resource.Id.aspect_ratio_preview);

                itemView.Click += (sender, e) => clickListener(new AspectRatioPreviewAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
                itemView.LongClick += (sender, e) => longClickListener(new AspectRatioPreviewAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });

            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

    }

    public class AspectRatioPreviewAdapterClickEventArgs : EventArgs
    {
        public View View { get; set; }
        public int Position { get; set; }
    }
}
