using Android.Animation;
using Android.App;
using Android.Content;
using Android.Views;
using System;
using WoWonder.Helpers.Utils;

namespace WoWonder.Library.Anjo
{
    public static class ReactConstants
    {
        //Color Constants
        public const string Blue = "#0366d6";
        public const string RedLove = "#f0716b";
        public const string RedAngry = "#f15268";
        public const string YellowHaHa = "#fde99c";
        public const string YellowWow = "#f0ba15";

        //Text Constants
        public const string Default = "Default";
        public static string Like = Application.Context.GetString(Resource.String.Btn_Like);
        public static string Love = Application.Context.GetString(Resource.String.Btn_Love);
        public static string HaHa = Application.Context.GetString(Resource.String.Btn_Haha);
        public static string Wow = Application.Context.GetString(Resource.String.Btn_Wow);
        public static string Sad = Application.Context.GetString(Resource.String.Btn_Sad);
        public static string Angry = Application.Context.GetString(Resource.String.Btn_Angry);

        public static void SetTranslateAnimation(Context Context, View view, string type)
        {
            try
            {
                bool mCanceled = false;
                // Load the bounce animation from the XML resource
                AnimatorSet animation = (AnimatorSet)AnimatorInflater.LoadAnimator(Context, Resource.Animator.reaction_bounce);

                if (type == ReactConstants.Like)
                {
                    animation = (AnimatorSet)AnimatorInflater.LoadAnimator(Context, Resource.Animator.reaction_bounce);
                }
                else if (type == ReactConstants.Love)
                {
                    animation = (AnimatorSet)AnimatorInflater.LoadAnimator(Context, Resource.Animator.reaction_heart);
                }
                else if (type == ReactConstants.HaHa)
                {
                    animation = (AnimatorSet)AnimatorInflater.LoadAnimator(Context, Resource.Animator.reaction_swing);
                }
                else if (type == ReactConstants.Wow)
                {
                    animation = (AnimatorSet)AnimatorInflater.LoadAnimator(Context, Resource.Animator.reaction_pulse);
                }
                else if (type == ReactConstants.Sad)
                {
                    animation = (AnimatorSet)AnimatorInflater.LoadAnimator(Context, Resource.Animator.reaction_fadeInDown);
                }
                else if (type == ReactConstants.Angry)
                {
                    animation = (AnimatorSet)AnimatorInflater.LoadAnimator(Context, Resource.Animator.reaction_headShake);
                }

                animation.AnimationStart += (sender, args) =>
                {
                    mCanceled = false;
                };

                animation.AnimationEnd += (sender, args) =>
                {
                    try
                    {
                        if (!mCanceled)
                        {
                            animation.Start();
                        }
                    }
                    catch (Exception e)
                    {
                        Methods.DisplayReportResultTrack(e);
                    }
                };

                animation.AnimationCancel += (sender, args) =>
                {
                    mCanceled = true;
                };

                animation.SetDuration(200);
                animation.SetTarget(view);
                animation.Start();
                view.Visibility = ViewStates.Visible;
            }
            catch (Exception e)
            {
                Methods.DisplayReportResultTrack(e);
            }
        }
    }
}