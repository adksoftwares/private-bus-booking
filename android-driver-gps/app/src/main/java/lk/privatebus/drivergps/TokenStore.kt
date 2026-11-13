package lk.privatebus.drivergps
import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
object TokenStore {
 private const val PREFS="driver_secure_session"
 private fun prefs(context:Context)=EncryptedSharedPreferences.create(context,PREFS,MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
 fun save(context:Context,token:String){prefs(context).edit().putString("access_token",token).apply()}
 fun get(context:Context):String?=prefs(context).getString("access_token",null)
 fun clear(context:Context){prefs(context).edit().remove("access_token").apply()}
}