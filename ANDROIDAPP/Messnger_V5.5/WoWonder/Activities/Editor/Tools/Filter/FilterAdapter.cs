using Android.App;
using Android.Graphics;
using Android.Views;
using Android.Widget;
using AndroidX.RecyclerView.Widget;
using JA.Burhanrashid52.Photoeditor;
using System;
using System.Collections.ObjectModel;
using System.Linq;
using WoWonder.Activities.Editor.Model;
using WoWonder.Helpers.Utils;

namespace WoWonder.Activities.Editor.Tools.Filter
{
    public class FilterAdapter : RecyclerView.Adapter
    {
        public event EventHandler<FilterAdapterClickEventArgs> ItemClick;
        public event EventHandler<FilterAdapterClickEventArgs> ItemLongClick;

        private readonly Activity ActivityContext;
        public readonly ObservableCollection<FilterModel> FilterList = new ObservableCollection<FilterModel>();

        public FilterAdapter(Activity context)
        {
            try
            {
                HasStableIds = true;
                ActivityContext = context;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public override int ItemCount => FilterList?.Count ?? 0;

        // Create new views (invoked by the layout manager) 
        public override RecyclerView.ViewHolder OnCreateViewHolder(ViewGroup parent, int viewType)
        {
            try
            {
                //Setup your layout here >> item_font_style
                var itemView = LayoutInflater.From(parent.Context)?.Inflate(Resource.Layout.item_filter_style, parent, false);
                var vh = new FilterAdapterViewHolder(itemView, OnClick, OnLongClick);
                return vh;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
                return null!;
            }
        }

        // Replace the contents of a view (invoked by the layout manager)
        public override async void OnBindViewHolder(RecyclerView.ViewHolder viewHolder, int position)
        {
            try
            {
                if (viewHolder is FilterAdapterViewHolder holder)
                {
                    var item = FilterList[position];
                    if (item != null)
                    {
                        holder.TxtFilterName.Text = item.PhotoFilter.ToString().Replace("_", " ").ToUpper();

                        if (item.PhotoFilter == PhotoFilter.None)
                        {
                            holder.ImgFilterView.SetImageBitmap(item.Image);
                            holder.TxtFilterName.Text = ActivityContext.GetText(Resource.String.Lbl_Original);
                        }
                        else
                        {
                            holder.ImgFilterView.SetImageBitmap(item.Image);
                            holder.ImgFilterView.SetOnImageChangedListener(new OnImageChangedListener(holder));

                            holder.EffectView.Visibility = ViewStates.Visible;
                            holder.EffectView.SetSourceBitmap(item.Image);
                            await holder.EffectView.SetFilterEffect(item.PhotoFilter);
                        }
                    }
                }
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        private class OnImageChangedListener : FilterImageView.IOnImageChangedListener
        {
            private readonly FilterAdapterViewHolder OuterInstance;

            public OnImageChangedListener(FilterAdapterViewHolder outerInstance)
            {
                OuterInstance = outerInstance;
            }

            public void OnBitmapLoaded(Bitmap sourceBitmap)
            {
                try
                {
                    OuterInstance.EffectView.SetFilterEffect(PhotoFilter.None);
                    OuterInstance.EffectView.SetSourceBitmap(sourceBitmap);
                    //OuterInstance.ImgFilterView.SetImageBitmap(sourceBitmap);
                    Console.WriteLine("onBitmapLoaded() called with: sourceBitmap = [" + sourceBitmap + "]");
                }
                catch (Exception e)
                {
                    Console.WriteLine(e);
                }
            }
        }

        public void Click_item(FilterModel item)
        {
            try
            {
                var check = FilterList.Where(a => a.ItemSelected).ToList();
                if (check.Count > 0)
                    foreach (var all in check)
                        all.ItemSelected = false;

                var click = FilterList.FirstOrDefault(a => a.Id == item.Id);
                if (click != null) click.ItemSelected = true;

                NotifyDataSetChanged();
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public FilterModel GetItem(int position)
        {
            return FilterList[position];
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

        public void SetupFilters(Bitmap imagePath)
        {
            try
            {
                var ImagePath = imagePath;

                if (FilterList.Count > 0)
                {
                    FilterList.Clear();
                    NotifyDataSetChanged();
                }

                FilterList.Add(new FilterModel()
                {
                    Id = 1,
                    Image = imagePath,
                    PhotoFilter = PhotoFilter.None
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 2,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/auto_fix.png"),
                    PhotoFilter = PhotoFilter.AutoFix
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 3,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/brightness.png"),
                    PhotoFilter = PhotoFilter.Brightness
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 4,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/contrast.png"),
                    PhotoFilter = PhotoFilter.Contrast
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 5,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/documentary.png"),
                    PhotoFilter = PhotoFilter.Documentary
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 6,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/dual_tone.png"),
                    PhotoFilter = PhotoFilter.DueTone
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 7,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/fill_light.png"),
                    PhotoFilter = PhotoFilter.FillLight
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 8,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/fish_eye.png"),
                    PhotoFilter = PhotoFilter.FishEye
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 9,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/grain.png"),
                    PhotoFilter = PhotoFilter.Grain
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 10,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/gray_scale.png"),
                    PhotoFilter = PhotoFilter.GrayScale
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 11,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/lomish.png"),
                    PhotoFilter = PhotoFilter.Lomish
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 12,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/negative.png"),
                    PhotoFilter = PhotoFilter.Negative
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 13,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/posterize.png"),
                    PhotoFilter = PhotoFilter.Posterize
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 14,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/saturate.png"),
                    PhotoFilter = PhotoFilter.Saturate
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 15,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/sepia.png"),
                    PhotoFilter = PhotoFilter.Sepia
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 16,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/sharpen.png"),
                    PhotoFilter = PhotoFilter.Sharpen
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 17,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/temprature.png"),
                    PhotoFilter = PhotoFilter.Temperature
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 18,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/tint.png"),
                    PhotoFilter = PhotoFilter.Tint
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 19,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/vignette.png"),
                    PhotoFilter = PhotoFilter.Vignette
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 20,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/cross_process.png"),
                    PhotoFilter = PhotoFilter.CrossProcess
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 21,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/b_n_w.png"),
                    PhotoFilter = PhotoFilter.BlackWhite
                });


                FilterList.Add(new FilterModel()
                {
                    Id = 22,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/flip_horizental.png"),
                    PhotoFilter = PhotoFilter.FlipHorizontal
                });
                FilterList.Add(new FilterModel()
                {
                    Id = 23,
                    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/flip_vertical.png"),
                    PhotoFilter = PhotoFilter.FlipVertical
                });
                //FilterList.Add(new FilterModel()
                //{
                //    Id = 24,
                //    Image = imagePath, //getBitmapFromAsset(ActivityContext, "filters/rotate.png"),
                //    PhotoFilter = PhotoFilter.Rotate
                //});
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

        public void OnClick(FilterAdapterClickEventArgs args) => ItemClick?.Invoke(this, args);
        public void OnLongClick(FilterAdapterClickEventArgs args) => ItemLongClick?.Invoke(this, args);
    }

    public class FilterAdapterViewHolder : RecyclerView.ViewHolder
    {
        public FilterImageView ImgFilterView { get; private set; }
        public FilterView EffectView { get; private set; }
        public TextView TxtFilterName { get; private set; }

        public View MainView { get; }

        public FilterAdapterViewHolder(View itemView, Action<FilterAdapterClickEventArgs> clickListener, Action<FilterAdapterClickEventArgs> longClickListener) : base(itemView)
        {
            try
            {
                MainView = itemView;

                ImgFilterView = itemView.FindViewById<FilterImageView>(Resource.Id.imgFilterView);
                EffectView = itemView.FindViewById<FilterView>(Resource.Id.effectView);
                TxtFilterName = itemView.FindViewById<TextView>(Resource.Id.txtFilterName);

                itemView.Click += (sender, e) => clickListener(new FilterAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });
                itemView.LongClick += (sender, e) => longClickListener(new FilterAdapterClickEventArgs { View = itemView, Position = BindingAdapterPosition });

                IsRecyclable = false;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }

    }

    public class FilterAdapterClickEventArgs : EventArgs
    {
        public View View { get; set; }
        public int Position { get; set; }
    }
}
