#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(GoogleAuthPlugin, "GoogleAuth",
    CAP_PLUGIN_METHOD(signIn, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(signOut, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getCurrentUser, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getAccessToken, CAPPluginReturnPromise);
)
