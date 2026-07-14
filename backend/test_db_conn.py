import asyncio
import asyncpg

async def main():
    try:
        conn = await asyncpg.connect('postgresql://postgres.qnfdjxlyorwlszkdqsdw:Hassan0556939051@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres')
        print("Success 1")
        await conn.close()
    except Exception as e:
        print("Error 1:", e)
        
    try:
        conn = await asyncpg.connect('postgresql://postgres:Hassan0556939051@db.qnfdjxlyorwlszkdqsdw.supabase.co:5432/postgres')
        print("Success 2")
        await conn.close()
    except Exception as e:
        print("Error 2:", e)

    try:
        conn = await asyncpg.connect('postgresql://postgres.qnfdjxlyorwlszkdqsdw:Hassan0556939051@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres')
        print("Success 3")
        await conn.close()
    except Exception as e:
        print("Error 3:", e)

    try:
        conn = await asyncpg.connect('postgresql://postgres:Hassan0556939051@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres')
        print("Success 4")
        await conn.close()
    except Exception as e:
        print("Error 4:", e)

    try:
        conn = await asyncpg.connect('postgresql://postgres:Hassan0556939051@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres')
        print("Success 5")
        await conn.close()
    except Exception as e:
        print("Error 5:", e)

if __name__ == '__main__':
    asyncio.run(main())
