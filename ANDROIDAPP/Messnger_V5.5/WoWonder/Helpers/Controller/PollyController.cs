using Polly;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace WoWonder.Helpers.Controller
{
    public class PollyController
    {
        public static void RunRetryPolicyFunction(List<Func<Task>> actionList, int retryCount = 2, int everySecond = 5)
        {
            var retryPolicy = Policy.Handle<Exception>().WaitAndRetryAsync(retryCount, i => TimeSpan.FromSeconds(everySecond));
            foreach (var action in actionList)
                retryPolicy.ExecuteAsync(action);
        }
    }
}